import type { ActionId, ApprenticeProfile, ScheduleAction } from "@starlit-apprentice/product-core";

export type SceneMood = "title" | "room" | "schedule" | "activity" | "result" | "ending" | "collection";
export type ActivityCue = Pick<ScheduleAction, "id" | "category" | "label" | "place">;
export type BackgroundGame = {
  setMood(mood: SceneMood, activityCue?: ActivityCue, apprenticeProfile?: ApprenticeProfile): void;
  destroy(): void;
};

const MOOD_COLORS: Record<SceneMood, { sky: number; floor: number; accent: number }> = {
  title: { sky: 0x162447, floor: 0x1f6f5f, accent: 0xf6c85f },
  room: { sky: 0x14213d, floor: 0x2a6f6c, accent: 0xe9c46a },
  schedule: { sky: 0x1d3557, floor: 0x457b9d, accent: 0xf4a261 },
  activity: { sky: 0x10243f, floor: 0x365f68, accent: 0xf6c85f },
  result: { sky: 0x112a46, floor: 0x4d908e, accent: 0xf9c74f },
  ending: { sky: 0x1b1b3a, floor: 0x52796f, accent: 0xffd166 },
  collection: { sky: 0x243b53, floor: 0x2d6a4f, accent: 0xf8ad9d }
};

type DrawableNode = CanvasRect | CanvasContainer;
type TweenTarget = CanvasRect | CanvasContainer;
type TweenValue = number | `${"+=" | "-="}${number}` | { from: number; to: number };
type TweenConfig = {
  targets: TweenTarget | TweenTarget[];
  x?: TweenValue;
  y?: TweenValue;
  alpha?: TweenValue;
  angle?: TweenValue;
  duration: number;
  yoyo?: boolean;
  repeat?: number;
  ease?: "Sine.inOut" | "Quad.inOut" | string;
};
type TweenProperty = {
  key: "x" | "y" | "alpha" | "angle";
  from: number;
  to: number;
};
type ActiveTween = {
  targets: TweenTarget[];
  properties: TweenProperty[];
  duration: number;
  yoyo: boolean;
  repeat: number;
  ease?: string;
  startedAt: number;
};
type SceneGraphOwner = {
  addRoot(node: DrawableNode): void;
  detachRoot(node: DrawableNode): void;
};

class CanvasRect {
  angle = 0;

  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
    public color: number,
    public alpha = 1,
    public readonly origin: "center" | "top-left" = "center"
  ) {}

  setX(x: number): this {
    this.x = x;
    return this;
  }

  setY(y: number): this {
    this.y = y;
    return this;
  }

  setAngle(angle: number): this {
    this.angle = angle;
    return this;
  }
}

class CanvasContainer {
  readonly children: DrawableNode[] = [];
  angle = 0;
  alpha = 1;
  scale = 1;

  constructor(
    private readonly owner: SceneGraphOwner,
    public x: number,
    public y: number
  ) {}

  add(nodes: DrawableNode | DrawableNode[]): this {
    for (const node of Array.isArray(nodes) ? nodes : [nodes]) {
      this.owner.detachRoot(node);
      this.children.push(node);
    }
    return this;
  }

  setX(x: number): this {
    this.x = x;
    return this;
  }

  setY(y: number): this {
    this.y = y;
    return this;
  }

  setAngle(angle: number): this {
    this.angle = angle;
    return this;
  }

  setScale(scale: number): this {
    this.scale = scale;
    return this;
  }
}

class CanvasGraphics {
  private color = 0xffffff;
  private alpha = 1;

  constructor(private readonly owner: SceneGraphOwner) {}

  fillStyle(color: number, alpha = 1): this {
    this.color = color;
    this.alpha = alpha;
    return this;
  }

  fillRect(x: number, y: number, width: number, height: number): this {
    this.owner.addRoot(new CanvasRect(x, y, width, height, this.color, this.alpha, "top-left"));
    return this;
  }
}

class TweenManager {
  private tweens: ActiveTween[] = [];
  private reducedMotion = false;

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    if (reducedMotion) {
      this.killAll();
    }
  }

  add(config: TweenConfig): void {
    if (this.reducedMotion) {
      return;
    }
    const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
    const properties = this.readProperties(config, targets[0]);
    if (targets.length === 0 || properties.length === 0) {
      return;
    }

    for (const target of targets) {
      for (const property of properties) {
        target[property.key] = property.from;
      }
    }

    this.tweens.push({
      targets,
      properties,
      duration: Math.max(1, config.duration),
      yoyo: Boolean(config.yoyo),
      repeat: config.repeat ?? 0,
      ease: config.ease,
      startedAt: performance.now()
    });
  }

  killAll(): void {
    this.tweens = [];
  }

  update(now: number): void {
    if (this.reducedMotion) {
      return;
    }
    for (let index = this.tweens.length - 1; index >= 0; index -= 1) {
      const tween = this.tweens[index];
      if (!tween) {
        continue;
      }
      const elapsed = Math.max(0, now - tween.startedAt);
      const cycle = Math.floor(elapsed / tween.duration);
      const isInfinite = tween.repeat === -1;
      const isFinished = !isInfinite && cycle > tween.repeat;
      const rawProgress = isFinished ? 1 : (elapsed % tween.duration) / tween.duration;
      const yoyoProgress = tween.yoyo && cycle % 2 === 1 ? 1 - rawProgress : rawProgress;
      const progress = this.ease(yoyoProgress, tween.ease);

      for (const target of tween.targets) {
        for (const property of tween.properties) {
          target[property.key] = property.from + (property.to - property.from) * progress;
        }
      }

      if (isFinished) {
        this.tweens.splice(index, 1);
      }
    }
  }

  private readProperties(config: TweenConfig, sample?: TweenTarget): TweenProperty[] {
    if (!sample) {
      return [];
    }

    const entries: TweenProperty[] = [];
    for (const key of ["x", "y", "alpha", "angle"] as const) {
      const value = config[key];
      if (value === undefined) {
        continue;
      }
      entries.push({ key, ...resolveTweenValue(sample[key], value) });
    }
    return entries;
  }

  private ease(progress: number, easing?: string): number {
    const clamped = clamp(progress, 0, 1);
    if (easing === "Sine.inOut") {
      return -(Math.cos(Math.PI * clamped) - 1) / 2;
    }
    if (easing === "Quad.inOut") {
      return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    }
    return clamped;
  }
}

export class StarlitScene implements BackgroundGame {
  private mood: SceneMood = "title";
  private activityCue?: ActivityCue;
  private apprenticeProfile?: ApprenticeProfile;
  private starSprites: CanvasRect[] = [];
  private apprentice?: CanvasContainer;
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly tweens = new TweenManager();
  private readonly add = {
    rectangle: (x: number, y: number, width: number, height: number, color: number, alpha = 1): CanvasRect => {
      const node = new CanvasRect(x, y, width, height, color, alpha);
      this.addRoot(node);
      return node;
    },
    container: (x: number, y: number): CanvasContainer => {
      const node = new CanvasContainer(this, x, y);
      this.addRoot(node);
      return node;
    },
    graphics: (): CanvasGraphics => new CanvasGraphics(this)
  };
  private readonly children = {
    removeAll: (): void => {
      this.roots = [];
    }
  };
  private roots: DrawableNode[] = [];
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private animationFrame?: number;
  private pageHidden = false;
  private pageFrozen = false;
  private readonly resizeObserver?: ResizeObserver;
  private readonly reducedMotionQuery?: MediaQueryList;
  private readonly handleResize = (): void => {
    if (this.syncCanvasSize()) {
      this.redraw();
      if (this.isReducedMotion()) {
        this.paint();
      }
    }
  };
  private readonly handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    this.tweens.setReducedMotion(event.matches);
    this.redraw();
    this.paint();
    if (event.matches) {
      this.stopRenderLoop();
    } else {
      this.startRenderLoop();
    }
  };
  private readonly handleDocumentVisibilityChange = (): void => {
    if (this.isDocumentHidden()) {
      this.stopRenderLoop();
      return;
    }
    if (this.isReducedMotion()) {
      this.paint();
      this.stopRenderLoop();
      return;
    }
    this.startRenderLoop();
  };
  private readonly handlePageHide = (): void => {
    this.pageHidden = true;
    this.stopRenderLoop();
  };
  private readonly handlePageShow = (): void => {
    this.pageHidden = false;
    if (this.isReducedMotion()) {
      this.paint();
      this.stopRenderLoop();
      return;
    }
    if (this.isDocumentHidden()) {
      this.stopRenderLoop();
      return;
    }
    this.startRenderLoop();
  };
  private readonly handlePageFreeze = (): void => {
    this.pageFrozen = true;
    this.stopRenderLoop();
  };
  private readonly handlePageResume = (): void => {
    this.pageFrozen = false;
    if (this.isReducedMotion()) {
      this.paint();
      this.stopRenderLoop();
      return;
    }
    if (this.isDocumentHidden() || this.pageHidden) {
      this.stopRenderLoop();
      return;
    }
    this.startRenderLoop();
  };

  constructor(parent: string) {
    const root = document.getElementById(parent);
    if (!root) {
      throw new Error(`Background canvas parent is missing: ${parent}`);
    }
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      imageRendering: "pixelated"
    });
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D canvas context is unavailable.");
    }

    this.root = root;
    this.canvas = canvas;
    this.context = context;
    this.root.replaceChildren(this.canvas);
    if ("matchMedia" in window) {
      this.reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.tweens.setReducedMotion(this.reducedMotionQuery.matches);
      this.reducedMotionQuery.addEventListener("change", this.handleReducedMotionChange);
    }
    this.syncCanvasSize();
    this.redraw();
    if (this.shouldPauseRenderLoop()) {
      this.paint();
      this.stopRenderLoop();
    } else {
      this.startRenderLoop();
    }

    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.root);
    }
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("pagehide", this.handlePageHide);
    window.addEventListener("pageshow", this.handlePageShow);
    document.addEventListener("visibilitychange", this.handleDocumentVisibilityChange);
    document.addEventListener("freeze", this.handlePageFreeze);
    document.addEventListener("resume", this.handlePageResume);
  }

  destroy(): void {
    if (this.animationFrame !== undefined) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pagehide", this.handlePageHide);
    window.removeEventListener("pageshow", this.handlePageShow);
    document.removeEventListener("visibilitychange", this.handleDocumentVisibilityChange);
    document.removeEventListener("freeze", this.handlePageFreeze);
    document.removeEventListener("resume", this.handlePageResume);
    this.reducedMotionQuery?.removeEventListener("change", this.handleReducedMotionChange);
    this.resizeObserver?.disconnect();
    this.root.replaceChildren();
    this.tweens.killAll();
  }

  setMood(mood: SceneMood, activityCue?: ActivityCue, apprenticeProfile?: ApprenticeProfile): void {
    this.mood = mood;
    this.activityCue = activityCue;
    this.apprenticeProfile = apprenticeProfile;
    this.redraw();
    if (this.shouldPauseRenderLoop()) {
      this.paint();
      this.stopRenderLoop();
    } else {
      this.startRenderLoop();
    }
  }

  addRoot(node: DrawableNode): void {
    this.roots.push(node);
  }

  detachRoot(node: DrawableNode): void {
    this.roots = this.roots.filter((candidate) => candidate !== node);
  }

  private redraw(): void {
    this.syncCanvasSize();
    const { width, height } = this;
    const colors = MOOD_COLORS[this.mood];
    this.tweens.killAll();
    this.children.removeAll();
    this.starSprites = [];

    const graphics = this.add.graphics();
    graphics.fillStyle(colors.sky, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.fillStyle(0x0b1020, 0.28);
    for (let y = 0; y < height; y += 12) {
      graphics.fillRect(0, y, width, 1);
    }

    this.drawStars(width, height, colors.accent);
    if (this.mood === "activity" && this.activityCue) {
      this.drawActivityStage(width, height, colors.floor, colors.accent, this.activityCue);
      return;
    }
    this.drawRoom(width, height, colors.floor, colors.accent);
    this.drawApprentice(width, height, colors.accent);
  }

  private render = (now: number): void => {
    this.animationFrame = undefined;
    if (this.syncCanvasSize()) {
      this.redraw();
    }
    if (this.isReducedMotion()) {
      this.paint();
      this.stopRenderLoop();
      return;
    }
    if (this.isDocumentHidden() || this.pageHidden || this.pageFrozen) {
      this.stopRenderLoop();
      return;
    }
    this.tweens.update(now);
    this.paint();
    this.startRenderLoop();
  };

  private isReducedMotion(): boolean {
    return Boolean(this.reducedMotionQuery?.matches);
  }

  private isDocumentHidden(): boolean {
    return document.visibilityState === "hidden";
  }

  private shouldPauseRenderLoop(): boolean {
    return this.isReducedMotion() || this.isDocumentHidden() || this.pageHidden || this.pageFrozen;
  }

  private startRenderLoop(): void {
    if (this.animationFrame !== undefined || this.shouldPauseRenderLoop()) {
      this.updateCanvasMotionState();
      return;
    }
    this.updateCanvasMotionState();
    this.animationFrame = window.requestAnimationFrame(this.render);
  }

  private stopRenderLoop(): void {
    if (this.animationFrame !== undefined) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
    this.updateCanvasMotionState();
  }

  private updateCanvasMotionState(): void {
    const reducedMotion = this.isReducedMotion();
    const documentHidden = this.isDocumentHidden();
    const paused = reducedMotion || documentHidden || this.pageHidden || this.pageFrozen;
    this.canvas.dataset.motion = reducedMotion ? "reduced" : "animated";
    this.canvas.dataset.renderLoop = paused ? "paused" : "running";
    this.canvas.dataset.renderLoopReason = reducedMotion
      ? "reduced-motion"
      : documentHidden
        ? "document-hidden"
        : this.pageHidden
          ? "page-hidden"
          : this.pageFrozen
            ? "page-frozen"
            : "active";
  }

  private paint(): void {
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.context.imageSmoothingEnabled = false;
    this.context.clearRect(0, 0, this.width, this.height);
    for (const node of this.roots) {
      drawNode(this.context, node);
    }
  }

  private syncCanvasSize(): boolean {
    const bounds = this.root.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width || window.innerWidth));
    const height = Math.max(1, Math.round(bounds.height || window.innerHeight));
    const pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2);
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;

    if (changed) {
      this.width = width;
      this.height = height;
      this.pixelRatio = pixelRatio;
      this.canvas.width = Math.round(width * pixelRatio);
      this.canvas.height = Math.round(height * pixelRatio);
    }

    return changed;
  }

  private drawStars(width: number, height: number, accent: number): void {
    const count = Math.max(24, Math.floor(width / 12));
    for (let index = 0; index < count; index += 1) {
      const x = (index * 47) % Math.max(width, 1);
      const y = 24 + ((index * 31) % Math.max(Math.floor(height * 0.42), 1));
      const size = index % 5 === 0 ? 3 : 2;
      const star = this.add.rectangle(x, y, size, size, accent, index % 3 === 0 ? 0.95 : 0.6);
      this.starSprites.push(star);
      this.tweens.add({
        targets: star,
        alpha: { from: 0.35, to: 1 },
        duration: 900 + index * 18,
        yoyo: true,
        repeat: -1
      });
    }
  }

  private drawActivityStage(
    width: number,
    height: number,
    floor: number,
    accent: number,
    cue: ActivityCue
  ): void {
    const graphics = this.add.graphics();
    const floorTop = Math.floor(height * 0.42);
    graphics.fillStyle(floor, 1);
    graphics.fillRect(0, floorTop, width, height - floorTop);
    graphics.fillStyle(0x101828, 0.74);
    for (let x = 0; x < width; x += 28) {
      graphics.fillRect(x, floorTop, 2, height - floorTop);
    }
    for (let y = floorTop; y < height; y += 28) {
      graphics.fillRect(0, y, width, 2);
    }

    this.drawActionSet(width, height, floorTop, accent, cue.id);
    this.drawActivityEffect(width, floorTop, accent, cue);
    this.drawActivityApprentice(width, floorTop, accent, cue);
  }

  private drawActionSet(
    width: number,
    height: number,
    floorTop: number,
    accent: number,
    actionId: ActionId
  ): void {
    const graphics = this.add.graphics();
    const centerX = Math.floor(width * 0.5);
    const workY = floorTop - 36;

    if (actionId === "letters" || actionId === "library-help" || actionId === "library") {
      this.drawDesk(centerX - 72, workY + 26, 126, accent);
      this.drawBookshelf(Math.max(32, centerX - 160), workY - 84);
      this.drawOpenBook(centerX - 78, workY - 10);
      return;
    }

    if (actionId === "music" || actionId === "theater-crew") {
      graphics.fillStyle(0x7f1d1d, 1);
      graphics.fillRect(24, workY - 96, 26, 142);
      graphics.fillRect(width - 50, workY - 96, 26, 142);
      graphics.fillStyle(accent, 1);
      graphics.fillRect(50, workY - 88, width - 100, 8);
      this.drawDesk(centerX - 72, workY + 30, 126, 0x7f5539);
      this.drawStageNotes(centerX - 86, workY - 38, accent);
      return;
    }

    if (actionId === "manners" || actionId === "tea-service") {
      this.drawDesk(centerX - 72, workY + 30, 126, 0x9c6644);
      this.drawTeaSet(centerX - 82, workY - 8, accent);
      graphics.fillStyle(0xf8ad9d, 1);
      graphics.fillRect(centerX + 62, workY - 42, 34, 54);
      return;
    }

    if (actionId === "crafts" || actionId === "workshop-errand") {
      this.drawDesk(centerX - 78, workY + 34, 142, 0x7f5539);
      this.drawToolWall(centerX - 152, workY - 88, accent);
      this.drawCrates(centerX + 48, workY - 10);
      return;
    }

    if (actionId === "star-lore") {
      this.drawTelescope(centerX - 98, workY - 10, accent);
      this.drawStarChart(centerX + 44, workY - 90, accent);
      return;
    }

    if (actionId === "stamina-drill") {
      graphics.fillStyle(0x0b1020, 0.5);
      graphics.fillRect(centerX - 128, floorTop + 38, 256, 12);
      this.drawTrainingWeights(centerX - 104, workY + 20, accent);
      this.drawTrainingWeights(centerX + 66, workY + 20, accent);
      return;
    }

    if (actionId === "garden-care" || actionId === "park") {
      this.drawPlants(centerX - 150, floorTop - 58, accent);
      this.drawBench(centerX + 44, floorTop - 36);
      return;
    }

    if (actionId === "scribe-aide") {
      this.drawDesk(centerX - 72, workY + 30, 126, 0x7f5539);
      this.drawPaperStack(centerX - 84, workY - 18, accent);
      graphics.fillStyle(0xf6c85f, 1);
      graphics.fillRect(centerX + 58, workY - 44, 18, 52);
      return;
    }

    if (actionId === "home-rest" || actionId === "sleep-in") {
      this.drawBed(centerX - 96, floorTop - 48, actionId === "sleep-in" ? 0x6d5dd3 : 0x4d908e);
      return;
    }

    if (actionId === "hot-spring") {
      this.drawHotSpring(centerX - 118, floorTop - 34, accent);
      return;
    }

    if (actionId === "market") {
      this.drawMarketStall(centerX - 126, floorTop - 96, accent);
      this.drawCrates(centerX + 60, floorTop - 64);
      return;
    }

    if (actionId === "plaza") {
      this.drawPlaza(centerX - 112, floorTop - 108, accent);
    }
  }

  private drawActivityApprentice(width: number, floorTop: number, accent: number, cue: ActivityCue): void {
    if (cue.category === "rest") {
      this.drawRestingApprentice(width, floorTop, accent, cue.id);
      return;
    }

    const x = cue.category === "outing" ? Math.floor(width * 0.38) : Math.floor(width * 0.58);
    const y = floorTop - 22;
    const apprentice = this.add.container(x, y);
    const shadow = this.add.rectangle(0, 32, 58, 10, 0x080b12, 0.35);
    const robe = this.add.rectangle(0, 10, 38, 54, 0x6d5dd3, 1);
    const trim = this.add.rectangle(0, 2, 44, 8, accent, 1);
    const head = this.add.rectangle(0, -32, 30, 28, 0xffd7a8, 1);
    const hair = this.add.rectangle(0, -43, 34, 12, 0x2f1f2f, 1);
    const eyeLeft = this.add.rectangle(-7, -31, 3, 3, 0x111827, 1);
    const eyeRight = this.add.rectangle(7, -31, 3, 3, 0x111827, 1);
    const arm = this.add.rectangle(-24, 4, 10, 28, 0xffd7a8, 1);
    const satchel = this.add.rectangle(18, 12, 12, 22, 0x9c6644, 1);
    apprentice.add([shadow, robe, trim, head, hair, eyeLeft, eyeRight, arm, satchel]);

    if (cue.category === "outing") {
      this.tweens.add({
        targets: apprentice,
        x: Math.floor(width * 0.68),
        y: y - 5,
        duration: 760,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
      return;
    }

    if (cue.category === "work") {
      this.tweens.add({
        targets: apprentice,
        x: x + 24,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: "Quad.inOut"
      });
      this.tweens.add({
        targets: arm,
        angle: 18,
        duration: 240,
        yoyo: true,
        repeat: -1
      });
      return;
    }

    this.tweens.add({
      targets: apprentice,
      y: y - 6,
      duration: 560,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut"
    });
    this.tweens.add({
      targets: arm,
      angle: -18,
      duration: 300,
      yoyo: true,
      repeat: -1
    });
  }

  private drawRestingApprentice(width: number, floorTop: number, accent: number, actionId: ActionId): void {
    const x = Math.floor(width * 0.54);
    const y = actionId === "hot-spring" ? floorTop - 28 : floorTop - 54;
    const body = this.add.container(x, y);

    if (actionId === "hot-spring") {
      const head = this.add.rectangle(0, -16, 30, 28, 0xffd7a8, 1);
      const hair = this.add.rectangle(0, -28, 34, 10, 0x2f1f2f, 1);
      const water = this.add.rectangle(0, 4, 74, 16, 0xa7f3d0, 0.9);
      body.add([water, head, hair]);
    } else {
      const robe = this.add.rectangle(8, 8, 70, 22, 0x6d5dd3, 1);
      const head = this.add.rectangle(-38, 0, 28, 24, 0xffd7a8, 1);
      const blanket = this.add.rectangle(16, 14, 82, 18, accent, 1);
      body.add([robe, head, blanket]);
    }

    this.tweens.add({
      targets: body,
      y: y + 4,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut"
    });
  }

  private drawActivityEffect(width: number, floorTop: number, accent: number, cue: ActivityCue): void {
    const baseX = Math.floor(width * 0.48);
    const baseY = floorTop - 96;
    const effectColor = cue.category === "work" ? 0xf8ad9d : cue.category === "rest" ? 0xe5eef7 : accent;
    for (let index = 0; index < 7; index += 1) {
      const particle = this.add.rectangle(baseX + index * 12, baseY + (index % 3) * 10, 5, 5, effectColor, 0.9);
      this.tweens.add({
        targets: particle,
        y: particle.y - 28,
        alpha: { from: 0.2, to: 1 },
        duration: 520 + index * 90,
        yoyo: true,
        repeat: -1
      });
    }
  }

  private drawDesk(x: number, y: number, width: number, color: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 1);
    graphics.fillRect(x, y, width, 24);
    graphics.fillStyle(0x5c3d2e, 1);
    graphics.fillRect(x + 10, y + 22, 12, 54);
    graphics.fillRect(x + width - 22, y + 22, 12, 54);
  }

  private drawOpenBook(x: number, y: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xf7f1d5, 1);
    graphics.fillRect(x, y, 26, 20);
    graphics.fillRect(x + 30, y, 26, 20);
    graphics.fillStyle(0x4d908e, 1);
    graphics.fillRect(x + 5, y + 6, 16, 3);
    graphics.fillRect(x + 35, y + 6, 14, 3);
  }

  private drawBookshelf(x: number, y: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x7f5539, 1);
    graphics.fillRect(x, y, 78, 96);
    graphics.fillStyle(0x0b1020, 1);
    graphics.fillRect(x + 6, y + 8, 66, 22);
    graphics.fillRect(x + 6, y + 38, 66, 22);
    graphics.fillStyle(0x6d5dd3, 1);
    graphics.fillRect(x + 12, y + 12, 8, 18);
    graphics.fillStyle(0xf8ad9d, 1);
    graphics.fillRect(x + 24, y + 12, 8, 18);
    graphics.fillStyle(0x4d908e, 1);
    graphics.fillRect(x + 38, y + 42, 8, 18);
    graphics.fillStyle(0xf6c85f, 1);
    graphics.fillRect(x + 52, y + 42, 8, 18);
  }

  private drawStageNotes(x: number, y: number, accent: number): void {
    for (let index = 0; index < 4; index += 1) {
      const note = this.add.rectangle(x + index * 28, y + (index % 2) * 16, 5, 22, accent, 1);
      const head = this.add.rectangle(note.x - 4, note.y + 11, 12, 8, 0xf8ad9d, 1);
      this.tweens.add({
        targets: [note, head],
        y: "-=18",
        alpha: { from: 0.45, to: 1 },
        duration: 680 + index * 90,
        yoyo: true,
        repeat: -1
      });
    }
  }

  private drawTeaSet(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xf7f1d5, 1);
    graphics.fillRect(x, y + 10, 30, 18);
    graphics.fillRect(x + 40, y + 14, 16, 14);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x + 4, y + 5, 18, 6);
    graphics.fillStyle(0xe5eef7, 1);
    graphics.fillRect(x + 10, y - 18, 4, 14);
    graphics.fillRect(x + 44, y - 12, 4, 12);
  }

  private drawToolWall(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x14213d, 1);
    graphics.fillRect(x, y, 100, 62);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x + 14, y + 12, 8, 34);
    graphics.fillRect(x + 10, y + 12, 16, 6);
    graphics.fillStyle(0xe5eef7, 1);
    graphics.fillRect(x + 44, y + 10, 8, 36);
    graphics.fillRect(x + 38, y + 40, 20, 6);
    graphics.fillStyle(0xf8ad9d, 1);
    graphics.fillRect(x + 72, y + 16, 10, 28);
  }

  private drawCrates(x: number, y: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x9c6644, 1);
    graphics.fillRect(x, y + 22, 34, 30);
    graphics.fillRect(x + 28, y, 34, 52);
    graphics.fillStyle(0xf6c85f, 1);
    graphics.fillRect(x + 5, y + 30, 22, 4);
    graphics.fillRect(x + 34, y + 8, 22, 4);
  }

  private drawTelescope(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x4d908e, 1);
    graphics.fillRect(x, y, 74, 14);
    graphics.fillStyle(0xe5eef7, 1);
    graphics.fillRect(x + 64, y - 8, 22, 26);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x + 28, y + 12, 8, 54);
    graphics.fillStyle(0x9c6644, 1);
    graphics.fillRect(x + 6, y + 64, 68, 6);
  }

  private drawStarChart(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x101828, 1);
    graphics.fillRect(x, y, 82, 58);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x + 16, y + 15, 5, 5);
    graphics.fillRect(x + 46, y + 12, 4, 4);
    graphics.fillRect(x + 58, y + 34, 5, 5);
    graphics.fillStyle(0xe5eef7, 1);
    graphics.fillRect(x + 21, y + 17, 25, 2);
    graphics.fillRect(x + 49, y + 16, 10, 20);
  }

  private drawTrainingWeights(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xe5eef7, 1);
    graphics.fillRect(x, y, 14, 42);
    graphics.fillRect(x + 54, y, 14, 42);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x + 14, y + 18, 40, 6);
  }

  private drawPlants(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x9c6644, 1);
    graphics.fillRect(x + 8, y + 54, 34, 22);
    graphics.fillRect(x + 74, y + 54, 34, 22);
    graphics.fillStyle(0x80b918, 1);
    graphics.fillRect(x + 14, y + 30, 22, 26);
    graphics.fillRect(x + 78, y + 24, 26, 32);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x + 21, y + 24, 8, 8);
    graphics.fillRect(x + 89, y + 18, 8, 8);
  }

  private drawBench(x: number, y: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x9c6644, 1);
    graphics.fillRect(x, y, 96, 10);
    graphics.fillRect(x + 8, y + 18, 80, 10);
    graphics.fillRect(x + 12, y + 28, 8, 30);
    graphics.fillRect(x + 76, y + 28, 8, 30);
  }

  private drawPaperStack(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xf7f1d5, 1);
    graphics.fillRect(x, y, 46, 32);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x + 6, y + 8, 32, 3);
    graphics.fillRect(x + 6, y + 16, 26, 3);
  }

  private drawBed(x: number, y: number, blanket: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x9c6644, 1);
    graphics.fillRect(x, y + 38, 188, 26);
    graphics.fillStyle(0xf7f1d5, 1);
    graphics.fillRect(x + 10, y + 16, 50, 28);
    graphics.fillStyle(blanket, 1);
    graphics.fillRect(x + 58, y + 24, 120, 28);
    graphics.fillStyle(0x7f5539, 1);
    graphics.fillRect(x + 8, y + 64, 10, 28);
    graphics.fillRect(x + 166, y + 64, 10, 28);
  }

  private drawHotSpring(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x4d908e, 1);
    graphics.fillRect(x, y + 44, 232, 58);
    graphics.fillStyle(0xa7f3d0, 1);
    graphics.fillRect(x + 14, y + 58, 204, 12);
    graphics.fillStyle(0x9c6644, 1);
    graphics.fillRect(x - 4, y + 96, 240, 10);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x + 18, y + 20, 6, 22);
    graphics.fillRect(x + 54, y + 10, 6, 30);
    graphics.fillRect(x + 90, y + 18, 6, 22);
  }

  private drawMarketStall(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x9c6644, 1);
    graphics.fillRect(x + 18, y + 62, 172, 72);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x, y + 24, 210, 38);
    graphics.fillStyle(0xf8ad9d, 1);
    graphics.fillRect(x + 24, y + 24, 28, 38);
    graphics.fillRect(x + 84, y + 24, 28, 38);
    graphics.fillRect(x + 144, y + 24, 28, 38);
  }

  private drawPlaza(x: number, y: number, accent: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xf7f1d5, 1);
    graphics.fillRect(x + 96, y + 62, 26, 96);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(x + 84, y + 48, 50, 16);
    graphics.fillStyle(0xf8ad9d, 1);
    graphics.fillRect(x, y + 20, 88, 22);
    graphics.fillStyle(0x6d5dd3, 1);
    graphics.fillRect(x + 132, y + 20, 88, 22);
    graphics.fillStyle(0xf7f1d5, 1);
    graphics.fillRect(x + 14, y + 42, 6, 112);
    graphics.fillRect(x + 200, y + 42, 6, 112);
  }

  private getRoomFloorTop(height: number): number {
    return Math.floor(height * (this.mood === "room" ? 0.47 : 0.66));
  }

  private drawRoom(width: number, height: number, floor: number, accent: number): void {
    const graphics = this.add.graphics();
    const floorTop = this.getRoomFloorTop(height);
    graphics.fillStyle(floor, 1);
    graphics.fillRect(0, floorTop, width, height - floorTop);
    graphics.fillStyle(0x101828, 0.7);
    for (let x = 0; x < width; x += 28) {
      graphics.fillRect(x, floorTop, 2, height - floorTop);
    }

    const deskX = Math.floor(width * 0.16);
    const deskY = floorTop - 36;
    graphics.fillStyle(0x7f5539, 1);
    graphics.fillRect(deskX, deskY, 112, 28);
    graphics.fillStyle(0x5c3d2e, 1);
    graphics.fillRect(deskX + 8, deskY + 24, 12, 52);
    graphics.fillRect(deskX + 88, deskY + 24, 12, 52);

    graphics.fillStyle(accent, 1);
    graphics.fillRect(deskX + 34, deskY - 20, 30, 16);
    graphics.fillStyle(0xf7f1d5, 1);
    graphics.fillRect(deskX + 68, deskY - 16, 24, 12);
  }

  private drawApprentice(width: number, height: number, accent: number): void {
    const floorTop = this.getRoomFloorTop(height);
    const profile = this.apprenticeProfile ?? {
      heightCm: 124,
      growthStage: "seedling",
      expression: "calm",
      pose: "standing",
      expressionLabel: "차분",
      poseLabel: "기본"
    };
    const isRoom = this.mood === "room";
    const x = Math.floor(width * (isRoom ? 0.76 : 0.72));
    const y = floorTop - (isRoom ? 8 : 22);
    const roomScale = isRoom ? 1.36 : 1;
    const growth = clamp((profile.heightCm - 124) / 28, 0, 1);
    const bodyHeight = Math.round(48 + growth * 22);
    const robeWidth = Math.round(34 + growth * 7);
    const headY = -bodyHeight - 12;
    const armY = -Math.round(bodyHeight * 0.44);
    this.apprentice = this.add.container(x, y);

    const shadow = this.add.rectangle(0, 12, 70 + growth * 16, 12, 0x080b12, 0.38);
    const legLeft = this.add.rectangle(-9, -8, 9, 20, 0x27385c, 1);
    const legRight = this.add.rectangle(9, -8, 9, 20, 0x27385c, 1);
    const robe = this.add.rectangle(0, -Math.round(bodyHeight / 2), robeWidth, bodyHeight, 0x6d5dd3, 1);
    const trim = this.add.rectangle(0, -bodyHeight + 6, robeWidth + 8, 8, accent, 1);
    const head = this.add.rectangle(0, headY, 30, 28, 0xffd7a8, 1);
    const hair = this.add.rectangle(0, headY - 15, 34, 12, 0x2f1f2f, 1);
    const eyeHeight = profile.expression === "tired" || profile.expression === "worried" ? 2 : 3;
    const eyeLeft = this.add.rectangle(-7, headY - 2, 3, eyeHeight, 0x111827, 1);
    const eyeRight = this.add.rectangle(7, headY - 2, 3, eyeHeight, 0x111827, 1);
    const mouth = this.drawApprenticeMouth(profile, headY);
    const leftArm = this.add.rectangle(-robeWidth / 2 - 5, armY, 9, 28, 0xffd7a8, 1);
    const rightArm = this.add.rectangle(robeWidth / 2 + 5, armY, 9, 28, 0xffd7a8, 1);
    const satchel = this.add.rectangle(robeWidth / 2 + 9, -Math.round(bodyHeight * 0.34), 12, 22, 0x9c6644, 1);
    const props = this.drawApprenticePose(profile, bodyHeight, robeWidth, leftArm, rightArm, accent);

    this.apprentice.add([
      shadow,
      legLeft,
      legRight,
      robe,
      trim,
      head,
      hair,
      eyeLeft,
      eyeRight,
      mouth,
      leftArm,
      rightArm,
      satchel,
      ...props
    ]);
    this.apprentice.setScale(roomScale);
    this.tweens.add({
      targets: this.apprentice,
      y: y - (profile.pose === "waving" || profile.expression === "bright" ? 7 * roomScale : 4 * roomScale),
      duration: profile.expression === "tired" ? 1900 : 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut"
    });
  }

  private drawApprenticeMouth(profile: ApprenticeProfile, headY: number): CanvasRect {
    if (profile.expression === "bright" || profile.expression === "proud") {
      return this.add.rectangle(0, headY + 8, 12, 3, 0x7f1d1d, 1);
    }
    if (profile.expression === "worried") {
      return this.add.rectangle(0, headY + 9, 10, 2, 0x7f1d1d, 1).setAngle(6);
    }
    if (profile.expression === "tired") {
      return this.add.rectangle(0, headY + 8, 8, 2, 0x7f1d1d, 1);
    }
    return this.add.rectangle(0, headY + 8, 7, 2, 0x7f1d1d, 1);
  }

  private drawApprenticePose(
    profile: ApprenticeProfile,
    bodyHeight: number,
    robeWidth: number,
    leftArm: CanvasRect,
    rightArm: CanvasRect,
    accent: number
  ): CanvasRect[] {
    const props: CanvasRect[] = [];
    if (profile.pose === "reading") {
      leftArm.setX(-robeWidth / 2 - 2).setY(-Math.round(bodyHeight * 0.36)).setAngle(-18);
      rightArm.setX(robeWidth / 2 + 2).setY(-Math.round(bodyHeight * 0.36)).setAngle(18);
      props.push(this.add.rectangle(0, -Math.round(bodyHeight * 0.34), 32, 18, 0xf7f1d5, 1));
      props.push(this.add.rectangle(0, -Math.round(bodyHeight * 0.34), 2, 18, 0x27385c, 1));
      return props;
    }
    if (profile.pose === "working") {
      leftArm.setAngle(18);
      rightArm.setX(robeWidth / 2 + 11).setY(-Math.round(bodyHeight * 0.5)).setAngle(-42);
      props.push(this.add.rectangle(robeWidth / 2 + 18, -Math.round(bodyHeight * 0.65), 8, 20, accent, 1));
      return props;
    }
    if (profile.pose === "relaxed") {
      leftArm.setY(-Math.round(bodyHeight * 0.28)).setAngle(12);
      rightArm.setY(-Math.round(bodyHeight * 0.28)).setAngle(-12);
      return props;
    }
    if (profile.pose === "waving") {
      rightArm.setX(robeWidth / 2 + 8).setY(-Math.round(bodyHeight * 0.72)).setAngle(-58);
      props.push(this.add.rectangle(robeWidth / 2 + 22, -Math.round(bodyHeight * 0.94), 8, 8, 0xffd7a8, 1));
      return props;
    }
    if (profile.pose === "confident") {
      leftArm.setAngle(28);
      rightArm.setAngle(-28);
      props.push(this.add.rectangle(0, -bodyHeight + 14, robeWidth + 14, 4, accent, 1));
    }
    return props;
  }
}

export function createBackgroundGame(parent: string): BackgroundGame {
  return new StarlitScene(parent);
}

function resolveTweenValue(current: number, value: TweenValue): { from: number; to: number } {
  if (typeof value === "number") {
    return { from: current, to: value };
  }
  if (typeof value === "string") {
    const delta = Number.parseFloat(value.slice(2));
    return { from: current, to: current + (value.startsWith("-=") ? -delta : delta) };
  }
  return value;
}

function drawNode(context: CanvasRenderingContext2D, node: DrawableNode): void {
  if (node instanceof CanvasRect) {
    drawRect(context, node);
    return;
  }

  context.save();
  context.globalAlpha *= node.alpha;
  context.translate(node.x, node.y);
  context.rotate((node.angle * Math.PI) / 180);
  context.scale(node.scale, node.scale);
  for (const child of node.children) {
    drawNode(context, child);
  }
  context.restore();
}

function drawRect(context: CanvasRenderingContext2D, node: CanvasRect): void {
  context.save();
  context.globalAlpha *= node.alpha;
  context.translate(node.x, node.y);
  context.rotate((node.angle * Math.PI) / 180);
  context.fillStyle = colorToCss(node.color);
  if (node.origin === "center") {
    context.fillRect(-node.width / 2, -node.height / 2, node.width, node.height);
  } else {
    context.fillRect(0, 0, node.width, node.height);
  }
  context.restore();
}

function colorToCss(color: number): string {
  return `#${Math.round(color).toString(16).padStart(6, "0").slice(-6)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
