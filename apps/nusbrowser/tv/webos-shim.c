// LD_PRELOAD per cog: il compositor webOS mostra una finestra solo se ha una wl_webos_shell_surface con appId.
// Protocollo: wayland-protocols/webos-shell.xml di webosbrew/SDL-webOS. Compilato da bootstrap.sh.
// webOS espone piu' wl_seat e cog ne ascolta uno solo: gli eventi degli altri vengono inoltrati a cog.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct wl_proxy;
struct wl_display;
struct wl_event_queue;
struct wl_surface;
struct wl_interface;
struct wl_message { const char *name; const char *signature; const struct wl_interface **types; };
struct wl_interface {
  const char *name;
  int version;
  int method_count;
  const struct wl_message *methods;
  int event_count;
  const struct wl_message *events;
};

extern const struct wl_interface wl_registry_interface, wl_surface_interface, wl_shell_surface_interface, wl_seat_interface, wl_pointer_interface, wl_keyboard_interface;
const char *wl_proxy_get_class(struct wl_proxy *);
uint32_t wl_proxy_get_version(struct wl_proxy *);
struct wl_display *wl_proxy_get_display(struct wl_proxy *);
struct wl_event_queue *wl_display_create_queue(struct wl_display *);
void *wl_proxy_create_wrapper(void *);
void wl_proxy_wrapper_destroy(void *);
void wl_proxy_set_queue(struct wl_proxy *, struct wl_event_queue *);
int wl_proxy_add_listener(struct wl_proxy *, void (**)(void), void *);
int wl_display_roundtrip_queue(struct wl_display *, struct wl_event_queue *);
int wl_display_flush(struct wl_display *);

typedef struct wl_proxy *(*marshal_t)(struct wl_proxy *, uint32_t, const struct wl_interface *, uint32_t, uint32_t, ...);
static marshal_t real;

static const struct wl_interface webos_surface_iface;
static const struct wl_interface *no_types[] = { NULL, NULL };
static const struct wl_interface *get_surface_types[] = { &webos_surface_iface, &wl_surface_interface };
static const struct wl_message shell_methods[] = {
  { "get_system_pip", "", no_types },
  { "get_shell_surface", "no", get_surface_types },
};
static const struct wl_interface webos_shell_iface = { "wl_webos_shell", 1, 2, shell_methods, 0, NULL };
static const struct wl_message surface_methods[] = {
  { "set_location_hint", "u", no_types },
  { "set_state", "u", no_types },
  { "set_property", "ss", no_types },
  { "set_key_mask", "u", no_types },
  { "set_size", "ii", no_types },
};
static const struct wl_message surface_events[] = {
  { "state_changed", "u", no_types },
  { "position_changed", "ii", no_types },
  { "close", "", no_types },
  { "exposed", "a", no_types },
  { "state_about_to_change", "u", no_types },
};
static const struct wl_interface webos_surface_iface = { "wl_webos_shell_surface", 1, 5, surface_methods, 5, surface_events };

enum { REQ_SET_STATE = 1, REQ_SET_PROPERTY = 2, STATE_FULLSCREEN = 3 };

static struct wl_proxy *shell;

/* Inoltro: tutti gli argomenti sono parole da 32 bit, anche wl_fixed_t e i puntatori. */
typedef void (*fw_t)(void *, struct wl_proxy *, uintptr_t, uintptr_t, uintptr_t, uintptr_t);
static void (**cog_pointer_impl)(void), (**cog_keyboard_impl)(void);
static void *cog_pointer_data, *cog_keyboard_data;
static struct wl_proxy *cog_pointer, *cog_keyboard;

#define FW(kind, idx, name) \
  static void name(void *d, struct wl_proxy *p, uintptr_t a, uintptr_t b, uintptr_t c, uintptr_t e) { \
    (void)d; (void)p; \
    if (cog_##kind##_impl) ((fw_t)cog_##kind##_impl[idx])(cog_##kind##_data, cog_##kind, a, b, c, e); \
  }
FW(pointer, 0, p_enter) FW(pointer, 1, p_leave) FW(pointer, 2, p_motion) FW(pointer, 3, p_button) FW(pointer, 4, p_axis)
FW(keyboard, 0, k_keymap) FW(keyboard, 1, k_enter) FW(keyboard, 2, k_leave) FW(keyboard, 3, k_key) FW(keyboard, 4, k_modifiers)
static void (*pointer_fw[])(void) = { (void (*)(void))p_enter, (void (*)(void))p_leave, (void (*)(void))p_motion, (void (*)(void))p_button, (void (*)(void))p_axis };
static void (*keyboard_fw[])(void) = { (void (*)(void))k_keymap, (void (*)(void))k_enter, (void (*)(void))k_leave, (void (*)(void))k_key, (void (*)(void))k_modifiers };

#define MAX_SEATS 8
static uint32_t seat_names[MAX_SEATS];
static int seat_count;

// Cog si tiene l'ultimo seat annunciato: gli altri li ascolta lo shim.
static void bind_other_seats(struct wl_proxy *reg) {
  for (int i = 0; i + 1 < seat_count; i++) {
    struct wl_proxy *seat = real(reg, 0, &wl_seat_interface, 3, 0, seat_names[i], "wl_seat", 3u, NULL);
    wl_proxy_set_queue(seat, NULL);
    struct wl_proxy *p = real(seat, 0, &wl_pointer_interface, 3, 0, NULL);
    struct wl_proxy *k = real(seat, 1, &wl_keyboard_interface, 3, 0, NULL);
    wl_proxy_add_listener(p, pointer_fw, NULL);
    wl_proxy_add_listener(k, keyboard_fw, NULL);
  }
  fprintf(stderr, "webos-shim: seat totali %d, inoltrati %d\n", seat_count, seat_count > 0 ? seat_count - 1 : 0);
}

static void on_global(void *data, struct wl_proxy *reg, uint32_t name, const char *iface, uint32_t version) {
  (void)data; (void)version;
  if (!shell && !strcmp(iface, "wl_webos_shell"))
    shell = real(reg, 0, &webos_shell_iface, 1, 0, name, iface, 1u, NULL);
  if (!strcmp(iface, "wl_seat") && seat_count < MAX_SEATS)
    seat_names[seat_count++] = name;
}
static void on_global_remove(void *data, struct wl_proxy *reg, uint32_t name) { (void)data; (void)reg; (void)name; }
static void (*registry_listener[])(void) = { (void (*)(void))on_global, (void (*)(void))on_global_remove };

static void attach(struct wl_proxy *any, struct wl_proxy *surface) {
  const char *app = getenv("APPID");
  struct wl_display *d = wl_proxy_get_display(any);
  if (!app) { fprintf(stderr, "webos-shim: APPID assente\n"); return; }
  if (!shell) {
    struct wl_event_queue *q = wl_display_create_queue(d);
    void *wrap = wl_proxy_create_wrapper(d);
    wl_proxy_set_queue(wrap, q);
    struct wl_proxy *reg = real(wrap, 1, &wl_registry_interface, 1, 0, NULL);
    wl_proxy_wrapper_destroy(wrap);
    wl_proxy_add_listener(reg, registry_listener, NULL);
    wl_display_roundtrip_queue(d, q);
    bind_other_seats(reg);
    wl_display_flush(d);
  }
  if (!shell) { fprintf(stderr, "webos-shim: wl_webos_shell assente\n"); return; }
  struct wl_proxy *w = real(shell, 1, &webos_surface_iface, 1, 0, NULL, surface);
  wl_proxy_set_queue(w, NULL); // nessun listener: gli eventi vengono scartati dalla coda normale
  real(w, REQ_SET_PROPERTY, NULL, 1, 0, "appId", app);
  real(w, REQ_SET_PROPERTY, NULL, 1, 0, "_WEBOS_ACCESS_POLICY_FORCESTRETCH", "true");
  real(w, REQ_SET_STATE, NULL, 1, 0, (uint32_t)STATE_FULLSCREEN);
  wl_display_flush(d);
  fprintf(stderr, "webos-shim: superficie webOS creata, appId=%s\n", app);
}

// ARM a 32 bit: gli argomenti Wayland sono tutti da 32 bit, quindi si possono inoltrare a parole.
struct wl_proxy *wl_proxy_marshal_flags(struct wl_proxy *p, uint32_t op, const struct wl_interface *iface, uint32_t ver, uint32_t flags, ...) {
  uint32_t a[6];
  va_list ap;
  va_start(ap, flags);
  for (int i = 0; i < 6; i++) a[i] = va_arg(ap, uint32_t);
  va_end(ap);
  struct wl_proxy *r = real(p, op, iface, ver, flags, a[0], a[1], a[2], a[3], a[4], a[5]);
  if (r && iface == &wl_shell_surface_interface) attach(p, (struct wl_proxy *)(uintptr_t)a[1]);
  return r;
}

// Si annotano i listener di cog per poterci inoltrare gli eventi degli altri seat.
int wl_proxy_add_listener(struct wl_proxy *p, void (**impl)(void), void *data) {
  static int (*real_add)(struct wl_proxy *, void (**)(void), void *);
  if (!real_add) real_add = (int (*)(struct wl_proxy *, void (**)(void), void *))dlsym(RTLD_NEXT, "wl_proxy_add_listener");
  const char *cls = wl_proxy_get_class(p);
  if (impl != pointer_fw && impl != keyboard_fw && cls) {
    if (!strcmp(cls, "wl_pointer")) { cog_pointer = p; cog_pointer_impl = impl; cog_pointer_data = data; }
    if (!strcmp(cls, "wl_keyboard")) { cog_keyboard = p; cog_keyboard_impl = impl; cog_keyboard_data = data; }
  }
  return real_add(p, impl, data);
}

__attribute__((constructor)) static void init(void) {
  real = (marshal_t)dlsym(RTLD_NEXT, "wl_proxy_marshal_flags");
  unsetenv("LD_PRELOAD"); // i processi figli di WPE non ne hanno bisogno
}
