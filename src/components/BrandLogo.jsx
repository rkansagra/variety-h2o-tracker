import logo from "../assets/Variety-H2O-+-Ice-Cream-Logo-Final.png";

// The shop's logo: the one brand mark on every screen (ROADMAP item I). width/height are the
// file's own size, so the browser reserves the space before it loads; the class sets the shown
// size (vh2o-topbar-logo, vh2o-appbar-logo, vh2o-auth-logo in src/index.css).
export default function BrandLogo({ id, className }) {
  return <img id={id} className={className} src={logo} alt="Variety H2O + Ice Cream" width={1080} height={470} />;
}
