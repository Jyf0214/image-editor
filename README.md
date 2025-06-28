# 高级图片处理器 (Advanced Image Processor)

这是一个功能强大的纯前端在线图片处理工具，旨在提供快速、流畅、无服务器依赖的图片批量转换与精准裁剪功能。项目采用现代Web技术构建，注重用户体验和性能。

**在线访问:** [高级图片处理器 (Advanced Image Processor)](https://jyf0214.github.io/image-editor/)

---

## ✨ 主要功能

*   **批量格式转换**:
    *   一次性上传多张图片。
    *   支持转换为 **PNG**, **JPEG**, 和 **WEBP** 格式。
    *   可自定义JPEG/WEBP的**图像质量**。
    *   所有处理后的图片打包成一个 **`.zip` 文件**下载。
*   **精准图片裁剪**:
    *   从文件列表中选择单张图片进行精细操作。
    *   自由调整裁剪框大小和位置。
    *   使用强大的 `Cropper.js` 库，提供专业级体验。
*   **极致性能体验**:
    *   利用 **Web Worker** 将所有耗时的图片处理任务移至后台线程。
    *   即使在处理大量或高分辨率图片时，UI界面也**绝不卡顿**。
    *   实时显示处理进度和加载动画，提供即时反馈。
*   **现代化用户界面**:
    *   支持**拖拽上传**和点击选择文件。
    *   **响应式设计**，完美适配桌面和移动设备。
    *   清晰的功能分区（转换 vs. 裁剪），操作直观。

---

## 🚀 技术栈

*   **HTML5 / CSS3**: 构建页面结构与现代化样式。
*   **JavaScript (ES6+)**: 实现所有核心逻辑。
*   **Web Workers**: 实现多线程处理，防止UI冻结。
*   **Cropper.js**: 用于专业的图片裁剪功能。
*   **JSZip**: 在浏览器端创建和打包`.zip`文件。
*   **File API & Blob API**: 用于处理本地文件和二进制数据。

---

## 本地运行与部署

### 本地运行

由于该项目使用了 Web Worker，直接通过 `file://` 协议打开 `index.html` 可能会遇到跨域安全限制。推荐使用一个简单的本地服务器来运行。

1.  **克隆或下载项目**:
    ```bash
    git clone https://github.com/your-username/your-repo-name.git
    cd your-repo-name
    ```

2.  **启动本地服务器**:
    如果你安装了Node.js，可以使用 `http-server` 或 `live-server`：
    
    *   安装 `http-server`:
        ```bash
        npm install -g http-server
        ```
    *   在项目根目录运行:
        ```bash
        http-server
        ```

    或者，如果你有Python 3:
    ```bash
    python -m http.server
    ```

3.  **访问**:
    在浏览器中打开 `http://localhost:8080` (或服务器指定的端口)。

### 部署到 GitHub Pages

1.  将所有项目文件 (`index.html`, `style.css`, `script.js`, `image-worker.js`, `README.md`) 推送到你的GitHub仓库。
2.  在仓库的 **Settings** -> **Pages** 页面，选择 `main` (或 `master`) 分支作为源，然后点击 **Save**。
3.  等待几分钟，你的网站就会部署在 `https://your-username.github.io/your-repo-name/`。

---

## 📝 更新日志

请参考应用界面底部的“版本更新”部分获取最新的功能更新和修复记录。