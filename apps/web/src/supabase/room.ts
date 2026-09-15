/**
 * Online room state.
 *
 * The client holds no authority: it reads the published hand state and its own
 * two cards, and asks Edge Functions to do anything else. Updates arrive over
 * Realtime, with a slow poll as a safety net if the socket is not up.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Action, Card, PlayerIndex, PublicHandState, RoomSettings } from 'engine';
import { callFunction, signIn, supabase } from './client.js';

export type Role = 'host' | 'guest';

export interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  guest_id: string | null;
  settings: RoomSettings;
  bankroll: [number, number];
  seat_of: [0 | 1, 0 | 1];
  hand_number: number;
  status: 'waiting' | 'ready' | 'playing' | 'closed';
}

export async function createRoom(settings: RoomSettings): Promise<{ roomId: string; code: string }> {
  await signIn();
  return callFunction('create_room', { settings });
}

export async function joinRoom(code: string): Promise<{ roomId: string; code: string; role: Role }> {
  await signIn();
  return callFunction('join_room', { code });
}

/** How often to re-read the state when Realtime is not connected. */
const POLL_MS = 2_500;

export interface OnlineRoom {
  loading: boolean;
  error: string | null;
  /** True while an action is in flight, so buttons can be disabled. */
  busy: boolean;
  /** True when the Realtime socket is up; false means we are polling instead. */
  live: boolean;
  room: RoomRow | null;
  hand: PublicHandState | null;
  /** The signed-in player's own two cards for the current hand. */
  myCards: [Card, Card] | null;
  /** 0 for the host, 1 for the guest. */
  myPerson: PlayerIndex | null;
  /** Which engine seat this player is in for the current hand. */
  mySeat: PlayerIndex | null;
  /** True when it is this player's turn. */
  myTurn: boolean;
  startHand: () => Promise<void>;
  act: (action: Action) => Promise<void>;
  dismissError: () => void;
}

export function useOnlineRoom(roomId: string | null): OnlineRoom {
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [hand, setHand] = useState<PublicHandState | null>(null);
  const [myCards, setMyCards] = useState<[Card, Card] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which hand we have already fetched cards for, so we do not refetch on every render.
  const cardsFor = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    signIn()
      .then((user) => {
        if (!cancelled) setUserId(user.id);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!roomId) return;
    const client = supabase();

    const [roomResult, stateResult] = await Promise.all([
      client.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      client.from('game_state').select('state').eq('room_id', roomId).maybeSingle(),
    ]);

    if (roomResult.error) throw new Error(roomResult.error.message);
    if (!roomResult.data) throw new Error('That room no longer exists');
    setRoom(roomResult.data as RoomRow);

    if (stateResult.error) throw new Error(stateResult.error.message);
    setHand((stateResult.data?.state as PublicHandState | undefined) ?? null);
  }, [roomId]);

  // First load.
  useEffect(() => {
    if (!roomId || !userId) return;
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, userId, refresh]);

  // Realtime: the room row and the published hand state.
  useEffect(() => {
    if (!roomId || !userId) return;
    const client = supabase();
    let channel: RealtimeChannel | null = null;

    channel = client
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_state', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const next = (payload.new as { state?: PublicHandState }).state;
          if (next) setHand(next);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => setRoom(payload.new as RoomRow),
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
      });

    return () => {
      setLive(false);
      if (channel) void client.removeChannel(channel);
    };
  }, [roomId, userId]);

  // Safety net: if the socket is not up, poll instead of going silent.
  useEffect(() => {
    if (!roomId || !userId || live) return;
    const timer = setInterval(() => {
      void refresh().catch(() => {
        /* a failed poll is not worth surfacing; the next one may succeed */
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [roomId, userId, live, refresh]);

  // Our own cards, whenever a new hand starts.
  useEffect(() => {
    if (!roomId || !userId || !room || room.hand_number === 0) return;
    if (cardsFor.current === room.hand_number) return;

    let cancelled = false;
    cardsFor.current = room.hand_number;

    void supabase()
      .from('hole_cards')
      .select('cards')
      .eq('room_id', roomId)
      .eq('hand_number', room.hand_number)
      .eq('player_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const cards = data?.cards as Card[] | undefined;
        setMyCards(cards && cards.length === 2 ? [cards[0]!, cards[1]!] : null);
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, userId, room]);

  const myPerson = useMemo((): PlayerIndex | null => {
    if (!room || !userId) return null;
    if (room.host_id === userId) return 0;
    if (room.guest_id === userId) return 1;
    return null;
  }, [room, userId]);

  const mySeat = useMemo((): PlayerIndex | null => {
    if (!room || myPerson === null) return null;
    return room.seat_of[0] === myPerson ? 0 : 1;
  }, [room, myPerson]);

  const run = useCallback(
    async (work: () => Promise<unknown>): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        await work();
        // Realtime will deliver the change too; this keeps the screen honest if
        // the socket is down or slow.
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const startHand = useCallback(
    (): Promise<void> => run(() => callFunction('start_hand', { roomId })),
    [run, roomId],
  );

  const act = useCallback(
    (action: Action): Promise<void> => run(() => callFunction('act', { roomId, action })),
    [run, roomId],
  );

  return {
    loading,
    error,
    busy,
    live,
    room,
    hand,
    myCards,
    myPerson,
    mySeat,
    myTurn: hand !== null && mySeat !== null && hand.toAct === mySeat,
    startHand,
    act,
    dismissError: useCallback(() => setError(null), []),
  };
}
