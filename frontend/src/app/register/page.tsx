import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create Account — PrepPilot · Blueprint" };

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-chalk bg-grid flex items-center justify-center p-6">
      <AuthForm mode="register" />
    </main>
  );
}
