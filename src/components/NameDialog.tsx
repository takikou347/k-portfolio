import { useState } from 'react';
import { NAME_MAX, NAME_MIN } from '../../shared/limits';
import type { Join, UserColor } from '../../shared/schema';
import { randomColor, randomName, USER_COLORS } from '../lib/profile';

type Props = {
  onSubmit: (profile: Join) => void;
};

const COLOR_LABELS: Record<UserColor, string> = {
  red: 'あか',
  blue: 'あお',
  yellow: 'きいろ',
  pink: 'ももいろ',
};

/** 初回入室時の名前入力。Desktop は中央モーダル、SP はボトムシート (CSS で切替) */
export default function NameDialog({ onSubmit }: Props) {
  const [name, setName] = useState(randomName);
  const [color, setColor] = useState<UserColor>(randomColor);
  const trimmed = name.trim();
  const valid = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;

  return (
    <div className="dialog-overlay" role="presentation">
      <form
        className="name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit({ name: trimmed, color });
        }}
      >
        <h1 id="name-dialog-title">なまえを かいてね</h1>
        <input
          type="text"
          value={name}
          maxLength={NAME_MAX}
          autoFocus
          aria-label={`なまえ (${NAME_MIN}〜${NAME_MAX}文字)`}
          onChange={(e) => setName(e.target.value)}
        />
        <fieldset className="color-picker">
          <legend>マグネットのいろ</legend>
          {USER_COLORS.map((c) => (
            <label key={c} className={`color-choice${color === c ? ' on' : ''}`}>
              <input
                type="radio"
                name="color"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
              />
              <span className={`magnet-dot magnet-${c}`} aria-hidden />
              <span className="visually-hidden">{COLOR_LABELS[c]}</span>
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={!valid}>
          はいる
        </button>
      </form>
    </div>
  );
}
