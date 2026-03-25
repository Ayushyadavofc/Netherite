interface NetheriteScrapIconProps {
  className?: string
  size?: number
}

export function NetheriteScrapIcon({ className = '', size = 16 }: NetheriteScrapIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Minimalist netherite scrap - angular brown shape */}
      <path d="M8 1L13 4L14 8L12 13L8 15L4 13L2 8L3 4L8 1Z" fill="#3d2b1f" />
      <path d="M8 2L12 4.5L13 8L11 12L8 14L5 12L3 8L4 4.5L8 2Z" fill="#5c4033" />
      <path d="M7 4L10 5.5L11 8L9.5 11L7 12L5 10.5L4 8L5 5.5L7 4Z" fill="#6b4c3b" />
      <path d="M8 5L9.5 6L10 8L9 10L7.5 10.5L6 9.5L5.5 8L6.5 6L8 5Z" fill="#7a5c4f" />
      {/* Highlights */}
      <path d="M6 4.5L8 3.5L9 4.5L7.5 5.5L6 4.5Z" fill="#8b6f5e" opacity="0.7" />
      <path d="M5 7L6 6L7 7L6 8L5 7Z" fill="#9e8070" opacity="0.4" />
    </svg>
  )
}
