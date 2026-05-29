type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
};

/** Скриншот/иллюстрация лендинга с рамкой и тенью */
export default function LandingVisual({ src, alt, priority, className = "" }: Props) {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{
        border: "1px solid var(--brd)",
        boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.06)",
        background: "var(--card)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={1200}
        height={680}
        className="w-full h-auto block"
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    </div>
  );
}
