import type { ReactNode } from 'react';

interface WindowProps {
  /** One quiet line above the felt: the spot and the hand number. */
  title?: ReactNode;
  children: ReactNode;
}

/**
 * The table and its controls as one framed window, the way a poker client
 * draws them: felt on top, a console strip along the bottom with the status
 * on the left and the buttons in the corner on the right.
 */
export function GameWindow({ title, children }: WindowProps) {
  return (
    <div className="game">
      {title && <div className="game-title">{title}</div>}
      {children}
    </div>
  );
}

interface ConsoleProps {
  /** Bottom-left: whose turn it is, the price being offered, or how the hand ended. */
  status?: ReactNode;
  /** Bottom-right: the action buttons, or the button that deals the next hand. */
  controls?: ReactNode;
}

export function Console({ status, controls }: ConsoleProps) {
  return (
    <div className="console">
      <div className="console-status">{status}</div>
      {controls && <div className="console-controls">{controls}</div>}
    </div>
  );
}
