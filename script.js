// script.js (V3.1 with deployment fix)
document.addEventListener('DOMContentLoaded', () => {
    // --- 元素获取部分保持不变 ---
    const uploadArea = document.getElementById('upload-area');
    const dropZone = document.getElementById('drop-zone');
    const imageInput = document.getElementById('image-input');
    const browseBtn = document.getElementById('browse-btn');
    const workspace = document.getElementById('workspace');
    const fileListContainer = document.getElementById('file-list');
    const clearAllBtn = document.getElementById('clear-all-btn');
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    const convertPanel = document.getElementById('convert-panel');
    const cropPanel = document.getElementById('crop-panel');

    const formatSelect = document.getElementById('format-select');
    const qualityControl = document.getElementById('quality-control');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');
    const startConversionBtn = document.getElementById('start-conversion-btn');
    
    const loadingOverlay = document.getElementById('loading-overlay');
    const progressText = document.getElementById('progress-text');
    
    const cropPlaceholder = document.getElementById('crop-placeholder');
    const cropperContainer = document.getElementById('cropper-container');
    const imageToCrop = document.getElementById('image-to-crop');
    const downloadCroppedBtn = document.getElementById('download-cropped-btn');
    const resetCropBtn = document.getElementById('reset-crop-btn');

    let fileStore = []; 
    let cropper = null;
    let selectedFileId = null;

    // --- 文件上传和UI更新逻辑 (与V3相同, 无需改动) ---
    browseBtn.addEventListener('click', () => imageInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    imageInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
        if (files.length === 0) return;
        const newFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        for (const file of newFiles) {
            const fileId = Date.now() + '-' + file.name;
            const fileObject = { id: fileId, file: file, thumb: URL.createObjectURL(file) };
            fileStore.push(fileObject);
        }
        updateFileListView();
        switchToWorkspaceView();
    }
    
    function updateFileListView() {
        fileListContainer.innerHTML = '';
        if (fileStore.length === 0) {
            switchToUploadView();
            return;
        }
        fileStore.forEach(fileObj => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.id = fileObj.id;
            item.innerHTML = `<img src="${fileObj.thumb}" alt="${fileObj.file.name}"><div class="file-info"><span class="name">${fileObj.file.name}</span><span class="size">${(fileObj.file.size / 1024).toFixed(1)} KB</span></div>`;
            item.addEventListener('click', () => selectFile(fileObj.id));
            fileListContainer.appendChild(item);
        });
        if (fileStore.length > 0 && (!selectedFileId || !fileStore.find(f => f.id === selectedFileId))) {
            selectFile(fileStore[0].id);
        } else if (selectedFileId) {
            selectFile(selectedFileId);
        }
    }

    function selectFile(fileId) {
        selectedFileId = fileId;
        document.querySelectorAll('.file-item').forEach(item => item.classList.toggle('selected', item.dataset.id === fileId));
        if (cropPanel.classList.contains('active')) {
            loadForCropping(fileId);
        }
    }
    
    function switchToWorkspaceView() {
        uploadArea.classList.add('hidden');
        workspace.classList.remove('hidden');
    }

    function switchToUploadView() {
        fileStore.forEach(f => URL.revokeObjectURL(f.thumb));
        fileStore = [];
        selectedFileId = null;
        imageInput.value = '';
        workspace.classList.add('hidden');
        uploadArea.classList.remove('hidden');
        if (cropper) cropper.destroy();
        cropper = null;
    }
    
    clearAllBtn.addEventListener('click', () => {
        if(confirm('确定要清空所有文件吗？')) {
            switchToUploadView();
        }
    });
    
    // --- 功能标签页切换 (与V3相同, 无需改动) ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(p => p.classList.add('hidden', 'active'));
            document.getElementById(`${tab}-panel`).classList.remove('hidden');
            document.getElementById(`${tab}-panel`).classList.add('active');
            if (tab === 'crop' && selectedFileId) loadForCropping(selectedFileId);
        });
    });

    // --- 格式转换逻辑 (关键修复在这里) ---
    formatSelect.addEventListener('change', () => { qualityControl.style.display = formatSelect.value === 'image/png' ? 'none' : 'block'; });
    qualitySlider.addEventListener('input', () => { qualityValue.textContent = parseFloat(qualitySlider.value).toFixed(2); });

    let worker = null;

    startConversionBtn.addEventListener('click', () => {
        if (fileStore.length === 0) return;

        toggleUIInteraction(false);
        progressText.textContent = `准备开始处理 ${fileStore.length} 张图片...`;

        const zip = new JSZip();
        let processedCount = 0;
        const totalFiles = fileStore.length;
        
        // **【关键修复】** 销毁旧的Worker并创建新的Worker实例
        if (worker) {
            worker.terminate();
        }
        
        try {
            // **【关键修复】** 使用URL来创建Worker，使其在任何环境下都能工作
            // 这会创建一个指向 'image-worker.js' 脚本的临时URL
            const workerScript = document.querySelector('script[src="image-worker.js"]');
            if (!workerScript && 'image-worker.js'.length > 0) { // 检查脚本是否存在
                 const workerUrl = new URL('image-worker.js', window.location.href);
                 worker = new Worker(workerUrl);
            } else {
                throw new Error("无法找到 'image-worker.js' 脚本。");
            }

        } catch (e) {
            alert("无法初始化后台处理模块(Web Worker)。请确保 'image-worker.js' 文件与 'index.html' 在同一目录下，并使用HTTP服务器访问本页面。\n错误: " + e.message);
            toggleUIInteraction(true);
            return;
        }

        worker.onmessage = (event) => {
            const { status, blob, name, message } = event.data;
            processedCount++;
            progressText.textContent = `正在处理... (${processedCount}/${totalFiles})`;

            if (status === 'success') {
                const originalName = name.split('.').slice(0, -1).join('.');
                const ext = formatSelect.value.split('/')[1];
                zip.file(`${originalName}.${ext}`, blob);
            } else {
                console.error(`处理文件 ${name} 失败:`, message);
            }

            if (processedCount === totalFiles) {
                progressText.textContent = '正在打包，请稍候...';
                
                zip.generateAsync({ type: 'blob' }).then(content => {
                    downloadBlob(content, 'converted-images.zip');
                    toggleUIInteraction(true);
                    worker.terminate(); // 完成后终止
                    worker = null;
                });
            }
        };
        
        worker.onerror = (e) => {
            console.error('Web Worker 发生错误:', e);
            alert('后台处理发生严重错误，请检查控制台获取更多信息。');
            toggleUIInteraction(true);
            worker.terminate();
            worker = null;
        };
        
        const format = formatSelect.value;
        const quality = format === 'image/png' ? undefined : parseFloat(qualitySlider.value);
        
        fileStore.forEach(fileObj => {
            worker.postMessage({
                file: fileObj.file,
                format: format,
                quality: quality
            });
        });
    });

    // --- 裁剪逻辑 (与V3相同, 无需改动) ---
    function loadForCropping(fileId) {
        const fileObj = fileStore.find(f => f.id === fileId);
        if (!fileObj) return;
        cropPlaceholder.classList.add('hidden');
        cropperContainer.classList.remove('hidden');
        if (cropper) {
            cropper.replace(fileObj.thumb);
        } else {
            imageToCrop.src = fileObj.thumb;
            cropper = new Cropper(imageToCrop, { viewMode: 1, background: false, autoCropArea: 0.8 });
        }
    }
    resetCropBtn.addEventListener('click', () => { if (cropper) cropper.reset(); });
    downloadCroppedBtn.addEventListener('click', () => {
        if (!cropper || !selectedFileId) return;
        const fileObj = fileStore.find(f => f.id === selectedFileId);
        const canvas = cropper.getCroppedCanvas();
        const format = 'image/png';
        const originalName = fileObj.file.name.split('.').slice(0, -1).join('.');
        canvas.toBlob(blob => {
            downloadBlob(blob, `${originalName}-cropped.png`);
        }, format);
    });

    // --- 辅助函数 ---
    function toggleUIInteraction(isEnabled) {
        startConversionBtn.disabled = !isEnabled;
        clearAllBtn.disabled = !isEnabled;
        tabBtns.forEach(btn => btn.disabled = !isEnabled);
        loadingOverlay.classList.toggle('hidden', isEnabled);
    }

    function downloadBlob(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
});

/**
 * 异步加载并渲染 changelog.md 文件
 */
async function loadChangelog() {
    const changelogContainer = document.getElementById('changelog-content');
    if (!changelogContainer) return;

    try {
        // 1. 获取 Markdown 文件内容
        const response = await fetch('changelog.md');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const markdownText = await response.text();

        // 2. 使用 Marked.js 将 Markdown 转换为 HTML
        const rawHtml = marked.parse(markdownText);
        
        // 3. 使用 DOMPurify 清洗 HTML，防止 XSS 攻击
        const sanitizedHtml = DOMPurify.sanitize(rawHtml);
        
        // 4. 将安全的 HTML 插入到页面
        changelogContainer.innerHTML = sanitizedHtml;

    } catch (error) {
        console.error('Failed to load changelog:', error);
        changelogContainer.innerHTML = '<p style="color: red;">无法加载更新日志。请检查网络连接或联系管理员。</p>';
    }
}

// 在 DOM 加载完成后，立即执行日志加载函数
document.addEventListener('DOMContentLoaded', () => {
    // ... 你现有的所有 DOMContentLoaded 代码都在这里 ...
    
    // 在最后调用新的函数
    loadChangelog();
});