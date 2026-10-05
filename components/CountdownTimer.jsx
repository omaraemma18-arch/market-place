import { useEffect, useState } from 'react';

// A live auction countdown. Computed client-side from `endTime` (an ISO
// string or Date) — the server remains the source of truth for whether
// an auction has actually ended (see the atomic check in bid.js); this
// timer is purely a UI convenience and should never be trusted to gate
// a real action on its own.
export default function CountdownTimer({ endTime, onEnd, className = '' }) {
  const [remaining, setRemaining] = useState(() => getRemaining(endTime));

  useEffect(() => {
    setRemaining(getRemaining(endTime));
    const id = setInterval(() => {
      const next = getRemaining(endTime);
      setRemaining(next);
      if (next.totalMs <= 0) {
        clearInterval(id);
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [endTime, onEnd]);

  if (remaining.totalMs <= 0) {
    return <span className={`font-semibold text-gray-500 ${className}`}>Auction ended</span>;
  }

  const urgent = remaining.totalMs < 5 * 60 * 1000; // under 5 minutes

  return (
    <span className={`font-semibold tabular-nums ${urgent ? 'text-red-600' : 'text-gray-800'} ${className}`}>
      {remaining.days > 0 && `${remaining.days}d `}
      {String(remaining.hours).padStart(2, '0')}:
      {String(remaining.minutes).padStart(2, '0')}:
      {String(remaining.seconds).padStart(2, '0')}
    </span>
  );
}

function getRemaining(endTime) {
  const totalMs = new Date(endTime).getTime() - Date.now();
  if (totalMs <= 0) return { totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

  const seconds = Math.floor(totalMs / 1000) % 60;
  const minutes = Math.floor(totalMs / (1000 * 60)) % 60;
  const hours = Math.floor(totalMs / (1000 * 60 * 60)) % 24;
  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));

  return { totalMs, days, hours, minutes, seconds };
}
