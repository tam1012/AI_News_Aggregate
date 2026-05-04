export function usesFluidShell(pathname: string) {
  return (
    pathname === '/' ||
    pathname.startsWith('/article') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/sources')
  );
}
