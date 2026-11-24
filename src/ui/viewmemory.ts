// Remembers where you were in a full-screen tab (Vehicles, Weapons, Missions):
//  - the list's scroll position, so Back from a detail page lands on the item you opened, not the top;
//  - which detail page was open (and how far down), so leaving the tab and coming back resumes right there.
export class ViewMemory {
  listY = 0;
  detailY = 0;
  /** detail page open when the tab was closed (resumed on the next plain open) */
  resume: string | null = null;
  /** item last opened from the list (focused again on Back, for keyboard / screen-reader users) */
  private opened: string | null = null;

  constructor(private el: HTMLElement, private inList: () => boolean) {
    el.addEventListener('scroll', () => {
      if (el.hidden) return;
      if (this.inList()) this.listY = el.scrollTop; else this.detailY = el.scrollTop;
    }, { passive: true });
  }

  /** Call at the start of showDetail. Returns the scroll position to use (0 for a new page). */
  enterDetail(slug: string, resuming: boolean): number {
    // resuming after the tab was closed: the list position saved back then still stands
    if (!resuming && this.inList()) { this.listY = this.el.scrollTop; this.opened = slug; }
    return resuming ? this.detailY : 0;
  }

  /** Call at the end of showList, after the list is rendered. */
  restoreList(attr: string): void {
    this.el.scrollTop = this.listY;
    if (this.opened) {
      this.el.querySelector<HTMLElement>(`[${attr}="${CSS.escape(this.opened)}"]`)?.focus({ preventScroll: true });
      this.opened = null;
    }
  }
}
