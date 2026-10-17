export function WeberStudioCredit() {
  return (
    <>
      Umsetzung:{" "}
      <a
        className="credit"
        href="https://weberstudio.ch"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 64 64" width="16" height="16" aria-hidden="true">
          <defs>
            <clipPath id="weberstudio-logo-clip">
              <polygon points="32,9 51,20 51,44 32,55 13,44 13,20" />
            </clipPath>
          </defs>
          <path
            clipPath="url(#weberstudio-logo-clip)"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinejoin="miter"
            strokeMiterlimit="10"
            d="M 16,12 L 16,42.3 L 26.7,48.4 L 26.7,15.6 L 32,12.5 L 37.3,15.6 L 37.3,48.4 L 48,42.3 L 48,12"
          />
        </svg>
        weberstudio.ch
      </a>
    </>
  );
}
