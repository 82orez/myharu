const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "My Haru";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-muted/40 px-6 py-8 text-center text-xs text-muted-foreground">
      <p>
        © {new Date().getFullYear()} {SITE_NAME}. All Rights Reserved.
      </p>
    </footer>
  );
}
