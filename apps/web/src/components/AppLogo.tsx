type AppLogoProps = {
  className?: string;
  size?: number;
};

export function AppLogo({ className, size = 24 }: AppLogoProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" rx="12" fill="currentColor" />
      <path d="M15 10h13l6 6v22H15V10Z" fill="white" fillOpacity="0.96" />
      <path d="M28 10v7h6" fill="white" fillOpacity="0.58" />
      <path d="M19 22h6.2a3.4 3.4 0 0 1 0 6.8H19V22Zm3 2.4v2h3.1a1 1 0 1 0 0-2H22Z" fill="currentColor" />
      <path d="M19 32h11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
