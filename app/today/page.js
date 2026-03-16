import TodayClient from './TodayClient';

export default function TodayPage({ searchParams }) {
  const initialDate = typeof searchParams?.date === 'string' ? searchParams.date : undefined;
  return <TodayClient initialDate={initialDate} />;
}
