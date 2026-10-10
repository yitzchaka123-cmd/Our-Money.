import { redirect } from 'next/navigation';

/**
 * There is nothing to show at the root: the app is the dashboard, which
 * itself shows the sign-in screen to anyone not yet signed in.
 */
export default function Home(): never {
  redirect('/dashboard');
}
