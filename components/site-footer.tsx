export function SiteFooter({ name }: { name: string }) {
  return (
    <footer className="site-footer">
      <span>{name}</span>
      <a className="site-footer-button" href="/docs/privacy/">Privacy policy</a>
    </footer>
  );
}
