import Link from "next/link";
import { FinderMark } from "@/components/auth-shell";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <FinderMark className="size-8 text-muted" />
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted">If you scanned a menu code, it may have been unpublished by the business.</p>
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Go to the homepage
        </Link>
      </div>
    </div>
  );
}
