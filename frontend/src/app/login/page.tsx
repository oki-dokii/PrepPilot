import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Sign In — PrepPilot · Blueprint" };

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-chalk bg-grid flex items-center justify-center p-6">
      <AuthForm mode="login" />
    </main>
  );
}
