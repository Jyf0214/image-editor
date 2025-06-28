/**
 * 高级图片处理器 - 主脚本 (V3.3)
 * 包含Web Worker批量处理、Cropper.js裁剪、动态加载更新日志模态框等功能。
 */

// 等待整个网页的DOM结构加载完成后再执行脚本
document.addEventListener('DOMContentLoaded', () => {

    // =======================================================
    // 1. 全局元素获取
    // =======================================================

    // --- 文件上传与工作区元素 ---
    const uploadArea = document.getElementById('upload-area');
    const dropZone = document.getElementById('drop-zone');
    const imageInput = document.getElementById('image-input');
    const browseBtn = document.getElementById('browse-btn');
    const workspace = document.getElementById('workspace');
    const fileListContainer = document.getElementById('file-list');
    const clearAllBtn = document.getElementById('clear-all-btn');

    // --- 功能面板切换元素 ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const convertPanel = document.getElementById('convert-panel');
    const cropPanel = document.getElementById('crop-panel');

    // --- 格式转换面板元素 ---
    const formatSelect = document.getElementById('format-select');
    const qualityControl = document.getElementById('quality-control');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');
    const startConversionBtn = document.getElementById('start-conversion-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const progressText = document.getElementById('progress-text');

    // --- 图片裁剪面板元素 ---
    const cropPlaceholder = document.getElementById('crop-placeholder');
    const cropperContainer = document.getElementById('cropper-container');
    const imageToCrop = document.getElementById('image-to-crop');
    const downloadCroppedBtn = document.getElementById('download-cropped-btn');
    const resetCropBtn = document.getElementById('reset-crop-btn');

    // --- 更新日志模态框元素 ---
    const showChangelogLink = document.getElementById('show-changelog-link');
    const changelogModal = document.getElementById('changelog-modal');
    const changelogContentArea = document.getElementById('changelog-content-area');
    const modalCloseBtn = changelogModal.querySelector('.modal-close-btn');

    // =======================================================
    // 2. 全局状态变量
    // =======================================================
    let fileStore = [];         // 存储所有上传的File对象 { id, file, thumb }
    let cropper = null;         // Cropper.js的实例
    let selectedFileId = null;  // 当前在文件列表中选中的文件ID
    let worker = null;          // Web Worker的实例
    let isChangelogLoaded = false; // 标记更新日志是否已加载，避免重复加载

    // =======================================================
    // 3. 事件监听器与核心逻辑
    // =======================================================

    // --- 文件上传与拖拽逻辑 ---
    browseBtn.addEventListener('click', () => imageInput.click()); // 点击按钮触发文件选择
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); }); // 拖拽进入区域
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover')); // 拖拽离开区域
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); }); // 拖拽释放
    imageInput.addEventListener('change', (e) => handleFiles(e.target.files)); // 通过文件选择器选择

    // --- 功能面板切换逻辑 ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return; // 如果按钮被禁用，则不执行任何操作
            const tab = btn.dataset.tab;
            // 更新按钮和面板的 'active' 状态
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(p => p.classList.add('hidden'));
            document.getElementById(`${tab}-panel`).classList.remove('hidden');

            // 如果切换到裁剪面板且有选中的文件，则加载该图片到裁剪器
            if (tab === 'crop' && selectedFileId) {
                loadForCropping(selectedFileId);
            }
        });
    });

    // --- 清空文件列表 ---
    clearAllBtn.addEventListener('click', () => {
        if (confirm('确定要清空所有文件吗？此操作不可撤销。')) {
            switchToUploadView();
        }
    });

    // --- 格式转换逻辑 ---
    formatSelect.addEventListener('change', () => { qualityControl.style.display = formatSelect.value === 'image/png' ? 'none' : 'block'; });
    qualitySlider.addEventListener('input', () => { qualityValue.textContent = parseFloat(qualitySlider.value).toFixed(2); });
    startConversionBtn.addEventListener('click', startBatchConversion);

    // --- 裁剪逻辑 ---
    resetCropBtn.addEventListener('click', () => { if (cropper) cropper.reset(); });
    downloadCroppedBtn.addEventListener('click', downloadCroppedImage);
    
    // --- 更新日志模态框逻辑 ---
    showChangelogLink.addEventListener('click', (e) => { e.preventDefault(); openChangelogModal(); });
    modalCloseBtn.addEventListener('click', closeChangelogModal);
    changelogModal.addEventListener('click', (e) => { if (e.target === changelogModal) closeChangelogModal(); }); // 点击遮罩关闭
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChangelogModal(); }); // 按ESC键关闭


    // =======================================================
    // 4. 功能函数定义
    // =======================================================

    /**
     * @description 处理用户选择或拖拽的文件
     * @param {FileList} files - 用户上传的文件列表
     */
    function handleFiles(files) {
        if (files.length === 0) return;
        // 过滤出图片文件
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        if(imageFiles.length === 0) {
            alert("未检测到有效的图片文件。请选择PNG, JPEG, WEBP等格式的图片。");
            return;
        }

        // 为每个文件创建唯一ID和缩略图URL
        for (const file of imageFiles) {
            const fileId = Date.now() + '-' + file.name;
            const fileObject = { id: fileId, file: file, thumb: URL.createObjectURL(file) };
            fileStore.push(fileObject);
        }
        updateFileListView();
        switchToWorkspaceView();
    }

    /**
     * @description 更新左侧的文件列表视图
     */
    function updateFileListView() {
        fileListContainer.innerHTML = '';
        if (fileStore.length === 0) {
            switchToUploadView();
            return;
        }

        // 为文件存储中的每个文件创建一个列表项
        fileStore.forEach(fileObj => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.id = fileObj.id;
            item.innerHTML = `<img src="${fileObj.thumb}" alt="${fileObj.file.name}"><div class="file-info"><span class="name">${fileObj.file.name}</span><span class="size">${(fileObj.file.size / 1024).toFixed(1)} KB</span></div>`;
            item.addEventListener('click', () => selectFile(fileObj.id));
            fileListContainer.appendChild(item);
        });
        
        // 智能选择一个文件：优先保持当前选择，否则选择第一个
        if (fileStore.length > 0 && (!selectedFileId || !fileStore.find(f => f.id === selectedFileId))) {
            selectFile(fileStore[0].id);
        } else if (selectedFileId) {
            selectFile(selectedFileId);
        }
    }
    
    /**
     * @description 选中一个文件，更新UI并为裁剪做准备
     * @param {string} fileId - 要选中的文件的ID
     */
    function selectFile(fileId) {
        selectedFileId = fileId;
        // 更新文件列表的视觉高亮
        document.querySelectorAll('.file-item').forEach(item => item.classList.toggle('selected', item.dataset.id === fileId));
        
        // 如果当前在裁剪面板，则立即加载此图片
        if (cropPanel.classList.contains('active')) {
            loadForCropping(fileId);
        }
    }

    /**
     * @description 切换到工作区视图
     */
    function switchToWorkspaceView() {
        uploadArea.classList.add('hidden');
        workspace.classList.remove('hidden');
    }

    /**
     * @description 切换回初始的上传视图，并清理所有状态
     */
    function switchToUploadView() {
        // 释放之前创建的缩略图URL，防止内存泄漏
        fileStore.forEach(f => URL.revokeObjectURL(f.thumb));
        fileStore = [];
        selectedFileId = null;
        imageInput.value = ''; // 清空<input>的值，以便能再次选择同名文件
        workspace.classList.add('hidden');
        uploadArea.classList.remove('hidden');
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
    }

    /**
     * @description 启动批量格式转换流程
     */
    function startBatchConversion() {
        if (fileStore.length === 0) {
            alert("请先添加至少一张图片。");
            return;
        }

        // 锁定UI，显示加载状态
        toggleUIInteraction(false);
        progressText.textContent = `准备开始处理 ${fileStore.length} 张图片...`;

        const zip = new JSZip();
        let processedCount = 0;
        const totalFiles = fileStore.length;
        
        // 销毁可能存在的旧Worker实例
        if (worker) worker.terminate();
        
        try {
            // 使用相对路径创建Worker，这在大多数服务器环境下都有效
            worker = new Worker('image-worker.js');
        } catch (e) {
            alert("错误：无法初始化后台处理模块(Web Worker)。请确保 'image-worker.js' 文件与主页面在同一目录下，并使用HTTP(S)服务器访问本页面，而不是直接打开本地文件。\n\n" + e.message);
            toggleUIInteraction(true);
            return;
        }
        
        // 监听来自Worker的消息
        worker.onmessage = (event) => {
            const { status, blob, name, message } = event.data;
            processedCount++;
            progressText.textContent = `正在处理... (${processedCount}/${totalFiles})`;

            if (status === 'success') {
                const originalName = name.split('.').slice(0, -1).join('.');
                const ext = formatSelect.value.split('/')[1];
                zip.file(`${originalName}.${ext}`, blob); // 添加到zip包
            } else {
                console.error(`处理文件 ${name} 失败:`, message);
            }

            // 所有文件处理完毕
            if (processedCount === totalFiles) {
                progressText.textContent = '正在生成ZIP包，请稍候...';
                
                zip.generateAsync({ type: 'blob', compression: "DEFLATE" }).then(content => {
                    downloadBlob(content, 'converted-images.zip');
                    toggleUIInteraction(true); // 恢复UI
                    worker.terminate(); // 任务完成，终止worker
                    worker = null;
                });
            }
        };

        // 监听Worker的错误事件
        worker.onerror = (e) => {
            console.error('Web Worker 发生错误:', e);
            alert('后台处理发生严重错误，操作已中断。请检查浏览器控制台获取详细信息。');
            toggleUIInteraction(true);
            if (worker) worker.terminate();
            worker = null;
        };
        
        // 准备转换参数并向Worker发送任务
        const format = formatSelect.value;
        const quality = format === 'image/png' ? undefined : parseFloat(qualitySlider.value);
        fileStore.forEach(fileObj => {
            worker.postMessage({ file: fileObj.file, format: format, quality: quality });
        });
    }

    /**
     * @description 为裁剪面板加载指定的图片
     * @param {string} fileId - 要加载的文件的ID
     */
    function loadForCropping(fileId) {
        const fileObj = fileStore.find(f => f.id === fileId);
        if (!fileObj) {
             // 如果找不到文件（可能已被清除），显示占位符
            cropperContainer.classList.add('hidden');
            cropPlaceholder.classList.remove('hidden');
            return;
        }

        cropPlaceholder.classList.add('hidden');
        cropperContainer.classList.remove('hidden');

        // 如果Cropper已存在，则替换图片；否则创建新实例
        if (cropper) {
            cropper.replace(fileObj.thumb);
        } else {
            imageToCrop.src = fileObj.thumb;
            cropper = new Cropper(imageToCrop, {
                viewMode: 1,
                background: false,
                autoCropArea: 0.8,
            });
        }
    }

    /**
     * @description 下载裁剪后的图片
     */
    function downloadCroppedImage() {
        if (!cropper || !selectedFileId) return;

        const fileObj = fileStore.find(f => f.id === selectedFileId);
        // 获取裁剪后的画布，可以指定尺寸
        const canvas = cropper.getCroppedCanvas({
            // maxWidth: 4096, // 可以添加限制，防止导出过大的图片
            // maxHeight: 4096,
            imageSmoothingQuality: 'high',
        });
        
        // 裁剪默认输出为高质量PNG，可以根据需求更改
        const format = 'image/png'; 
        const originalName = fileObj.file.name.split('.').slice(0, -1).join('.');
        
        // 将画布内容转为Blob对象并下载
        canvas.toBlob(blob => {
            downloadBlob(blob, `${originalName}-cropped.png`);
        }, format);
    }
    
    /**
     * @description 打开更新日志模态框
     */
    function openChangelogModal() {
        changelogModal.classList.add('visible');
        // 仅在第一次打开时加载内容
        if (!isChangelogLoaded) {
            loadChangelog();
        }
    }

    /**
     * @description 关闭更新日志模态框
     */
    function closeChangelogModal() {
        changelogModal.classList.remove('visible');
    }

    /**
     * @description 异步加载并渲染 changelog.md 文件
     */
    async function loadChangelog() {
        isChangelogLoaded = true; // 标记为已加载
        changelogContentArea.innerHTML = '<p>正在加载更新日志...</p>';
        try {
            // 1. 使用fetch API获取Markdown文件内容
            const response = await fetch('changelog.md');
            if (!response.ok) {
                throw new Error(`HTTP 错误! 状态码: ${response.status}`);
            }
            const markdownText = await response.text();

            // 2. 使用 Marked.js 将 Markdown 文本转换为 HTML 字符串
            const rawHtml = marked.parse(markdownText);
            
            // 3. 使用 DOMPurify 清洗HTML，防止XSS跨站脚本攻击
            const sanitizedHtml = DOMPurify.sanitize(rawHtml);
            
            // 4. 将安全的 HTML 内容插入到页面容器中
            changelogContentArea.innerHTML = sanitizedHtml;

        } catch (error) {
            console.error('加载更新日志失败:', error);
            changelogContentArea.innerHTML = '<p style="color: red;">抱歉，无法加载更新日志。请检查网络连接或刷新页面重试。</p>';
        }
    }

    /**
     * @description 统一控制UI交互状态（启用/禁用按钮和显示/隐藏加载动画）
     * @param {boolean} isEnabled - true为启用，false为禁用
     */
    function toggleUIInteraction(isEnabled) {
        startConversionBtn.disabled = !isEnabled;
        clearAllBtn.disabled = !isEnabled;
        tabBtns.forEach(btn => btn.disabled = !isEnabled);
        loadingOverlay.classList.toggle('hidden', isEnabled);
    }

    /**
     * @description 下载一个Blob对象
     * @param {Blob} blob - 要下载的Blob数据
     * @param {string} filename - 下载时使用的文件名
     */
    function downloadBlob(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href); // 下载后释放URL对象
    }
});