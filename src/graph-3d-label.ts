import * as THREE from "three";

export function createNodeLabelSprite(label: string, color: string): THREE.Sprite | undefined {
  if (!label || typeof document === "undefined") return undefined;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  const fontSize = 42;
  ctx.font = `600 ${fontSize}px sans-serif`;
  const textWidth = Math.ceil(ctx.measureText(label).width);
  canvas.width = textWidth + 24;
  canvas.height = fontSize + 16;
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0);
  sprite.scale.set(Math.max(label.length * 2.2, 12), 6, 1);
  sprite.renderOrder = 1;
  return sprite;
}
