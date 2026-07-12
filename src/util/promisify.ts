import Gio from 'gi://Gio';

// GJS type declarations expose Promise overloads, but the runtime only installs
// them after _promisify() has been called for each callback-based API.
Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');
