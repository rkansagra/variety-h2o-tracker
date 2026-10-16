// Renders a menu category's icon: an image when the category has `iconSrc`, otherwise its emoji.
// The image is sized in `em` so it scales with the surrounding font-size like the emoji does.
export default function CategoryIcon({ cat }) {
  return cat.iconSrc
    ? <img src={cat.iconSrc} alt="" style={{ width: "1.15em", height: "1.15em", objectFit: "contain", verticalAlign: "-0.2em" }} />
    : cat.icon;
}
