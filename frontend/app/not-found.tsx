import Link from "next/link";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col bg-background text-foreground dark:bg-[#001233] dark:text-white">
      <Header />
      <div className="container mx-auto flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-primary">
          404
        </p>
        <h1 className="mt-3 text-4xl font-bold">Page not found</h1>
        <p className="mt-3 max-w-lg text-muted-foreground">
          The page you were looking for does not exist or may have moved.
        </p>
        <Link href="/" className="mt-8">
          <Button>Back to Home</Button>
        </Link>
      </div>
    </main>
  );
}
