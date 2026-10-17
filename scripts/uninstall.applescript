display dialog "卸载拾影本地助手？请先退出 Chrome。已下载的视频与最近任务记录都会保留。" buttons {"取消", "卸载助手"} default button "取消" with title "拾影 · 卸载"
if button returned of result is "卸载助手" then
    do shell script "/bin/rm -rf '/Library/Application Support/VideoPocket'; /bin/rm -f '/Library/Google/Chrome/NativeMessagingHosts/com.videopocket.helper.json'; /usr/sbin/pkgutil --forget com.videopocket.helper >/dev/null 2>&1 || true" with administrator privileges
    display dialog "本地助手已卸载。你还可以在 Chrome 扩展管理页面移除拾影插件。" buttons {"完成"} default button "完成" with title "拾影"
end if
