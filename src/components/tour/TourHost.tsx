import { useEffect, useState } from 'react';
import { ProductTour, type TourStep } from './ProductTour';

const TOUR_FLAG = 'hrbuddy_run_tour';

const STEPS: TourStep[] = [
  {
    title: 'Welcome to VIBRND HR BUDDY',
    body: "This is your home base. Here's a quick 30-second tour of what you can do — you can skip anytime.",
  },
  {
    target: 'attendance',
    title: 'Mark your attendance',
    body: 'Check in when you start your shift and check out when you leave — right here.',
  },
  {
    target: 'quick-actions',
    title: 'Raise requests',
    body: 'Need a salary advance or want to apply for leave? These buttons do it.',
  },
  {
    target: 'notifications',
    title: 'Notifications',
    body: 'Approvals and updates land here. The badge shows what needs your attention.',
  },
  {
    target: 'language',
    title: 'Your language',
    body: 'Switch the app language anytime from here.',
  },
  {
    title: "You're all set! 🎉",
    body: 'Explore the menu for everything else — attendance history, payslips and more. Have a great day!',
  },
];

/** Runs the guided tour once after onboarding (flag set by the onboarding flow). */
export function TourHost() {
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(TOUR_FLAG) === '1') {
      const t = window.setTimeout(() => setRun(true), 700); // let the dashboard paint
      return () => window.clearTimeout(t);
    }
  }, []);

  const close = () => {
    localStorage.removeItem(TOUR_FLAG);
    setRun(false);
  };

  if (!run) return null;
  return <ProductTour steps={STEPS} onClose={close} />;
}

/** Re-run the tour on demand (e.g. from Settings). */
export function startTour() {
  localStorage.setItem(TOUR_FLAG, '1');
  window.location.href = '/dashboard';
}
