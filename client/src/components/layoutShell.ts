export function usesFluidShell(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/voz' ||
    pathname === '/reddit' ||
    pathname === '/youtube' ||
    pathname === '/digest' ||
    pathname.startsWith('/article') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/sources')
  );
}
