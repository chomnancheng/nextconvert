import { Show, UserButton } from "@clerk/react";

export default function AuthBar() {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Show when="signed-in">
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: "h-8 w-8",
            },
          }}
        />
      </Show>
    </div>
  );
}
