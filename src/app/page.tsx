import { LoginButtons } from '@/components/auth/login-buttons';

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center spotlight">
      <div className="text-center mb-12">
        <h1 className="text-6xl font-bold text-gold text-gold-glow mb-4 tracking-tight">
          StageCam
        </h1>
        <p className="text-muted text-lg max-w-md mx-auto">
          Rehearse movie scripts via webcam. Perform together, build your reel.
        </p>
      </div>

      <div className="w-full max-w-sm px-6">
        <LoginButtons authError={error} />
      </div>

      <p className="text-muted/50 text-xs mt-16 max-w-xs text-center">
        By signing in you agree to the terms. Google handles login; your public identity is chosen after sign-in.
      </p>
    </main>
  );
}
