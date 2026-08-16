import { signOut } from "@/app/(staff)/students/actions";

export function PortalHeader({ name }: { name: string }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Case Flow</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{name}</p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
