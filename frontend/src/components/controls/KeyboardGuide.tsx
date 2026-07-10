'use client';

export default function KeyboardGuide() {
  return (
    <div className="kbd-guide">
      <div className="panel__h panel__h--sub">Keyboard</div>
      <div className="kbd-guide__grid">
        <span>
          <kbd>W</kbd>/<kbd>S</kbd> → Y
        </span>
        <span>
          <kbd>A</kbd>/<kbd>D</kbd> → X
        </span>
        <span>
          <kbd>Q</kbd>/<kbd>E</kbd> → Z
        </span>
      </div>
      <p className="kbd-guide__hint">Hold Shift for fine jog · arrows also work</p>
    </div>
  );
}
