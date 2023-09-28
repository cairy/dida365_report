// ==UserScript==
// @name         滴答摘要
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://dida365.com/webapp/
// @match        https://www.dida365.com/webapp/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=dida365.com
// @grant        none
// @require      https://cdn.staticfile.org/html2canvas/1.4.1/html2canvas.min.js
// @run-at document-idle
// ==/UserScript==

(function () {
    'use strict';
    // dom元素转react对象
    function FindReact(dom, traverseUp = 0) {
        const key = Object.keys(dom).find(key => {
            return key.startsWith("__reactFiber$") // react 17+
                || key.startsWith("__reactInternalInstance$"); // react <17
        });
        const domFiber = dom[key];
        if (domFiber == null) return null;

        // react <16
        if (domFiber._currentElement) {
            let compFiber = domFiber._currentElement._owner;
            for (let i = 0; i < traverseUp; i++) {
                compFiber = compFiber._currentElement._owner;
            }
            return compFiber._instance;
        }

        // react 16+
        const GetCompFiber = fiber => {
            //return fiber._debugOwner; // this also works, but is __DEV__ only
            let parentFiber = fiber.return;
            while (typeof parentFiber.type == "string") {
                parentFiber = parentFiber.return;
            }
            return parentFiber;
        };
        let compFiber = GetCompFiber(domFiber);
        for (let i = 0; i < traverseUp; i++) {
            compFiber = GetCompFiber(compFiber);
        }
        return compFiber.stateNode;
    }
    // 修改总结文字
    function modifyText(text) {
        let text_list = text.split('\n');
        const regex_rq = /^#\s+(\d+)月(\d+)日-(\d+)月(\d+)日$/;
        const regex_task = /^-\s+<([^>]+)>(.+)$/;
        const regex_completed = /^##\s+已完成$/;
        const regex_incomplete = /^##\s+未完成$/;
        if (text_list[0].match(regex_rq)) {
            text_list.shift();
        }
        let this_projects = [];
        let this_dict = {};
        let next_projects = [];
        let next_dict = {};
        let current_dict;
        let current_projects;
        let current_project;
        for (let i = 0; i < text_list.length; i++) {
            const text = text_list[i];
            if (text.match(regex_completed)) {
                current_dict = this_dict;
                current_projects = this_projects;
            } else if (text.match(regex_incomplete)) {
                current_dict = next_dict;
                current_projects = next_projects;
            } else {
                const match = text.match(regex_task);
                if (match) {
                    current_project = match[1];
                    const task = match[2];
                    if (current_project in current_dict) {
                        current_dict[current_project].push(task);
                    } else {
                        current_dict[current_project] = [task];
                        current_projects.push(current_project);
                    }
                }
                else if(text.length>0) {
                    const task = current_dict[current_project].pop();
                    current_dict[current_project].push(task + '\n' + text)
                }
            }
        }
        let result_list = [`# 周总结 ${obj_date_select.state.customFrom.replaceAll('-', '')}-${moment().format("YYYYMMDD")}\n`, "## 本周总结"]
        result_list.push("---")
        for (const project of this_projects.reverse()) {
            let tasks = Array.from(this_dict[project].reverse(), i => `- ${i}`)
            if (tasks) {
                result_list.push(`### ${project}`)
                result_list.push(tasks.join('\n'))
            }
        }
        result_list.push("\n## 下周计划")
        result_list.push("---")
        for (const project of next_projects.reverse()) {
            let tasks = Array.from(next_dict[project].reverse(), i => `- ${i}`)
            if (tasks) {
                result_list.push(`### ${project}`)
                result_list.push(tasks.join('\n'))
            }
        }
        return result_list.join('\n');
    }
    function capture(title) {
        var box_list = document.getElementsByClassName("summary");
        var box = box_list[0]
        var canvas_list = box.getElementsByTagName("canvas");
        if (canvas_list) {
            canvas_list.forEach(element => {
                box.removeChild(element)
            });
        }
        const elements = document.getElementsByClassName("MDEditor");
        const element = elements[0]
        let width = element.offsetWidth;
        html2canvas(element, { windowWidth: width }).then(canvas => {
            box.appendChild(canvas);
            var canvas_list = box.getElementsByTagName("canvas");
            if (canvas_list != null && canvas_list.length > 0) {
                let canvas = canvas_list[0];
                var dataUrl = canvas.toDataURL("image/png");
                var link = document.createElement('a');
                link.download = title + ".png";
                link.href = dataUrl.replace("image/png", "image/octet-stream");
                link.click();
                box.removeChild(canvas)
            }
        });
    }
    function init() {
        // 摘要的根元素
        const element_root_list = document.getElementsByClassName("summary");
        if (element_root_list?.length > 0) {
            const element_root = element_root_list[0];
            const obj_root = FindReact(element_root);
            // 时间选择元素
            const element_date_list = element_root.getElementsByClassName("filter-duedate");
            if (element_date_list?.length > 0) {
                let element_date_select = element_date_list[0].firstChild;
                if (element_date_select) {
                    const obj_date_select = FindReact(element_date_select);
                    window.obj_date_select = obj_date_select;
                    setTimeout(() => {
                        // 设置显示项
                        const displayItems = obj_root.state.displayItems;
                        const displayProject = displayItems.find(i => i.key == 'project')
                        const displayTitle = displayItems.find(i => i.key == 'title')
                        displayProject.enabled = true;
                        displayTitle.enabled = true;
                        if (displayProject.sortOrder > displayTitle.sortOrder) {
                            const t = displayTitle.sortOrder;
                            displayTitle.sortOrder = displayProject.sortOrder;
                            displayProject.sortOrder = t;
                        }
                        // 设置分组项
                        obj_root.setState({ sortType: "progress" })
                        // 设置总结周期
                        obj_date_select.setState({ selectedKeys: ["custom"], customFrom: moment().startOf('week').format("YYYY-MM-DD"), customTo: moment().add(1, 'weeks').format('YYYY-MM-DD') });
                        // 触发内容更新
                        setTimeout(() => {
                            obj_date_select.confirmCustom()
                        }, 1000);
                    }, 1000);
                }
                else {
                    console.error("没有找到时间选择器下拉组件")
                }
            }
            else {
                console.error("没有找到时间选择器")
            }
            // 添加按钮
            const element_button_box_list = document.getElementsByClassName("summary-footer-btn-wrapper");
            if (element_button_box_list?.length > 0) {
                const element_button_box = element_button_box_list[0];
                const element_button_save = element_button_box.firstChild.cloneNode(true)
                element_button_save.firstChild.innerText = '格式化'
                element_button_save.addEventListener('click', () => {
                    const text = obj_root.state.content;
                    obj_root.setState({ content: modifyText(text) })
                })
                element_button_box.insertBefore(element_button_save, element_button_box.lastChild)
                element_button_box.firstChild.style.display = "none";
                const element_button_capture = element_button_box.lastChild.cloneNode(true)
                element_button_capture.firstChild.innerText = '保存图片'
                element_button_capture.addEventListener('click', () => {
                    capture(`周总结${obj_date_select.state.customFrom.replaceAll('-', '')}-${moment().format("YYYYMMDD")}`)
                })
                element_button_box.insertBefore(element_button_capture, element_button_box.lastChild)
                element_button_box.lastChild.style.display = "none";
            }
            else {
                console.error("没有找到按钮组")
            }
        }
        else {
            console.error("找不到摘要dom")
        }
    }
    function locationHashChanged() {
        if (location.hash === "#q/all/summary") {
            init();
        }
    }

    window.onhashchange = locationHashChanged;
    var url = window.location.href;
    // 检查URL是否以#q/all/summary结尾
    if (url.endsWith("#q/all/summary")) {
        setTimeout(function () {
            init()
        }, 3000)
    }
})();
