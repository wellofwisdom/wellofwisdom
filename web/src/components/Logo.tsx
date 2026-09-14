// SPDX-License-Identifier: AGPL-3.0-or-later
// The brand mark: the carved stone well with nine hazel leaves on the water.
// One component so every place the product names itself shows the same image
// at a crisp resolution. Decorative by default (alt=""), because it always
// sits beside the words "Well of Wisdom"; pass a label when it stands alone.
export default function Logo({ size = 28, label, className }: { size?: number; label?: string; className?: string }) {
  return (
    <img
      className={className ? `logo ${className}` : "logo"}
      src={size > 48 ? "/logo-192.png" : "/logo-96.png"}
      srcSet={size > 48 ? "/logo-192.png 1x" : "/logo-96.png 1x, /logo-192.png 2x"}
      width={size}
      height={size}
      alt={label || ""}
      aria-hidden={label ? undefined : true}
      decoding="async"
      draggable={false}
    />
  );
}
