// Renders the source PNGs that @capacitor/assets turns into Android icons/splash. Run: node assets/render-icons.mjs
import sharp from "sharp";
import fs from "node:fs";
const fg = fs.readFileSync(new URL("./icon-foreground.svg", import.meta.url));
const bg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#0d1117"/><path d="M0 256h1024M0 512h1024M0 768h1024M256 0v1024M512 0v1024M768 0v1024" stroke="#161b22" stroke-width="6"/></svg>');
const out = (f) => new URL("./" + f, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
await sharp(fg).resize(1024, 1024).png().toFile(out("icon-foreground.png"));
await sharp(bg).resize(1024, 1024).png().toFile(out("icon-background.png"));
const fgSmall = await sharp(fg).resize(880, 880).png().toBuffer();
await sharp(bg).resize(1024, 1024).composite([{ input: fgSmall, gravity: "center" }]).png().toFile(out("icon-only.png"));
const logo = await sharp(fg).resize(700, 700).png().toBuffer();
for (const f of ["splash.png", "splash-dark.png"]) await sharp({ create: { width: 2732, height: 2732, channels: 4, background: "#0d1117" } }).composite([{ input: logo, gravity: "center" }]).png().toFile(out(f));
console.log("rendered assets/*.png");
