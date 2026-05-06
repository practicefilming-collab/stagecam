import { redirect } from 'next/navigation';

export default async function AuditionAdminAliasPage({
  params,
}: {
  params: Promise<{ auditionId: string }>;
}) {
  const { auditionId } = await params;
  redirect(`/pro/auditions/${auditionId}`);
}
