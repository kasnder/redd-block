!macro NSIS_HOOK_PREUNINSTALL
  MessageBox MB_OK|MB_ICONINFORMATION "If $\"Keep Blocking after uninstall$\" is enabled:$\n$\nTo override blocks, reinstall ReDD Block and use $\"Override all$\" in Settings.$\n$\nUrgent help: contact team@reddfocus.org or create an issue at github.com/ulyngs/redd-block/issues"
!macroend
