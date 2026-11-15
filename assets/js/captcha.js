// The guestbook's captcha on the rack: hCaptcha's widget. Its script comes from hcaptcha.com only once the visitor
// touches the form (a focus, a tap), so a page nobody writes from loads nothing from elsewhere. The widget puts its
// answer into the form (h-captcha-response) and site-api checks it. The light version's form has no captcha.
document.addEventListener('alpine:init', () => {
  const Alpine = window.Alpine;
  const READY = 'gbCaptchaReady'; // hCaptcha calls it once its script has loaded
  const API = `https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off&onload=${READY}`;
  const root = document.documentElement;
  let script = null; // the promise of hCaptcha, one for the page: a unit swapped in after a post is a new form

  function load() {
    script ??= new Promise((resolve, reject) => {
      window[READY] = () => resolve(window.hcaptcha);
      const s = document.createElement('script');
      s.src = API;
      s.async = true;
      // Blocked or offline: the next touch of the form tries again.
      s.onerror = () => { script = null; s.remove(); reject(new Error('hcaptcha did not load')); };
      document.head.append(s);
    });
    return script;
  }
  // The rack's theme: one chosen with the button (data-theme) wins over the system's.
  const theme = () => (root.dataset.theme ? root.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches) ? 'dark' : 'light';

  Alpine.data('captcha', () => ({
    failed: false, // the script did not load: the note offers the light version
    need: false,   // sent unsolved: the note asks to tick it

    init() {
      this.form = this.$root.closest('form');
      this.touch = () => this.show();
      // A form after a post: the script is here already, the widget is drawn at once.
      if (script) this.show();
      else for (const ev of ['focusin', 'pointerdown']) this.form.addEventListener(ev, this.touch, { passive: true });
      // Sent unsolved: not sent. A widget that never came is the server's to answer (gb.err.captcha).
      this.onSend = (e) => {
        if (this.id != null && !this.hc.getResponse(this.id)) { e.preventDefault(); this.need = true; }
      };
      this.form.addEventListener('htmx:beforeRequest', this.onSend);
      // The theme switched: the widget is drawn again in the new one (an answer given goes; it is one tick).
      this.themes = new MutationObserver(() => { if (this.id != null) this.draw(); });
      this.themes.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    },
    destroy() {
      this.gone = true;
      this.untouch();
      this.form.removeEventListener('htmx:beforeRequest', this.onSend);
      this.themes.disconnect();
      this.remove();
    },
    untouch() {
      for (const ev of ['focusin', 'pointerdown']) this.form.removeEventListener(ev, this.touch);
    },
    async show() {
      this.untouch();
      this.failed = false;
      try {
        this.hc = await load();
      } catch {
        if (this.gone) return;
        this.failed = true;
        for (const ev of ['focusin', 'pointerdown']) this.form.addEventListener(ev, this.touch, { passive: true });
        return this.relayout();
      }
      if (!this.gone && this.id == null) this.draw();
    },
    draw() {
      this.remove();
      this.id = this.hc.render(this.$refs.widget, {
        sitekey: this.$root.dataset.sitekey,
        theme: theme(),
        hl: root.lang || 'en', // the page's language, not the browser's: the site is in English
        size: this.form.clientWidth < 304 ? 'compact' : 'normal', // the normal one is 302px wide
        callback: () => { this.need = false; },
      });
      this.relayout();
    },
    remove() {
      if (this.id == null) return;
      try { this.hc.remove(this.id); } catch { /* gone with the old form */ }
      this.id = null;
      this.$refs.widget.replaceChildren();
    },
    // The widget changes the unit's height: lay out the rack and the cables again.
    relayout() {
      this.$nextTick(() => document.dispatchEvent(new Event('rack:layout')));
    },
  }));
});
