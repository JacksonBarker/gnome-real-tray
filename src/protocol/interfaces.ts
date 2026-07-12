export const WATCHER_BUS_NAME = 'org.kde.StatusNotifierWatcher';
export const WATCHER_OBJECT_PATH = '/StatusNotifierWatcher';
export const SNI_INTERFACE = 'org.kde.StatusNotifierItem';
export const PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
export const DEFAULT_ITEM_PATH = '/StatusNotifierItem';

export const WATCHER_XML = `<node>
  <interface name="org.kde.StatusNotifierWatcher">
    <method name="RegisterStatusNotifierItem"><arg name="service" type="s" direction="in"/></method>
    <method name="RegisterStatusNotifierHost"><arg name="service" type="s" direction="in"/></method>
    <property name="RegisteredStatusNotifierItems" type="as" access="read"/>
    <property name="IsStatusNotifierHostRegistered" type="b" access="read"/>
    <property name="ProtocolVersion" type="i" access="read"/>
    <signal name="StatusNotifierItemRegistered"><arg name="service" type="s"/></signal>
    <signal name="StatusNotifierItemUnregistered"><arg name="service" type="s"/></signal>
  </interface>
</node>`;

export const DBUS_MENU_XML = `<node>
  <interface name="com.canonical.dbusmenu">
    <method name="GetLayout"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="as" direction="in"/><arg type="u" direction="out"/><arg type="(ia{sv}av)" direction="out"/></method>
    <method name="Event"><arg type="i" direction="in"/><arg type="s" direction="in"/><arg type="v" direction="in"/><arg type="u" direction="in"/></method>
    <signal name="LayoutUpdated"><arg type="u"/><arg type="i"/></signal>
  </interface>
</node>`;
