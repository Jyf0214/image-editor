// script.js (V3 with Web Worker)
document.addEventListener('DOMContentLoaded', () => {
    // --- 元素获取 (与V2基本相同, 增加了loadingOverlay和progressText) ---
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
    
    // 新增的加载元素
    const loadingOverlay = document.getElementById('loading-overlay');
    const progressText = document.getElementById('progress-text');
    
    // 裁剪面板元素... (与V2相同)
    const cropPlaceholder = document.getElementById('crop-placeholder');
    const cropperContainer = document.getElementById('cropper-container');
    const imageToCrop = document.getElementById('image-to-crop');
    const downloadCroppedBtn = document.getElementById('download-cropped-btn');
    const resetCropBtn = document.getElementById('reset-crop-btn');

    // --- 状态管理 ---
    let fileStore = []; 
    let cropper = null;
    let selectedFileId = null;

    // --- 文件上传和UI更新逻辑 (与V2完全相同) ---
    // (此处省略了这部分代码以保持简洁，请直接使用V2版本的这部分代码)
    // 从 browseBtn.addEventListener('click', ...) 开始
    // 到 clearAllBtn.addEventListener('click', ...) 结束
    // --- START of V2 code to copy ---
    browseBtn.addEventListener('click', () => imageInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    imageInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
        if (files.length === 0) return;
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
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
    
    clearAllBtn.addEventListener('click', switchToUploadView);
    // --- END of V2 code to copy ---

    // --- 功能标签页切换 (与V2相同) ---
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

    // --- 格式转换逻辑 (使用Web Worker重构) ---
    formatSelect.addEventListener('change', () => { qualityControl.style.display = formatSelect.value === 'image/png' ? 'none' : 'block'; });
    qualitySlider.addEventListener('input', () => { qualityValue.textContent = parseFloat(qualitySlider.value).toFixed(2); });

    startConversionBtn.addEventListener('click', () => {
        if (fileStore.length === 0) return;

        // 1. 禁用按钮并显示加载动画
        toggleUIInteraction(false);
        progressText.textContent = `准备开始处理 ${fileStore.length} 张图片...`;

        const zip = new JSZip();
        const totalFiles = fileStore.length;
        let processedCount = 0;
        
        // 2. 创建一个新的Web Worker
        const worker = new Worker('image-worker.js');

        // 3. 设置监听器，接收来自Worker的消息
        worker.onmessage = (event) => {
            const { status, blob, name, message } = event.data;

            processedCount++;
            progressText.textContent = `正在处理... (${processedCount}/${totalFiles})`;

            if (status === 'success') {
                // 将处理好的blob添加到zip包
                const originalName = name.split('.').slice(0, -1).join('.');
                const ext = formatSelect.value.split('/')[1];
                zip.file(`${originalName}.${ext}`, blob);
            } else {
                console.error(`处理文件 ${name} 失败:`, message);
            }

            // 4. 当所有文件都处理完毕
            if (processedCount === totalFiles) {
                progressText.textContent = '正在打包，请稍候...';
                
                zip.generateAsync({ type: 'blob' }).then(content => {
                    downloadBlob(content, 'converted-images.zip');
                    
                    // 5. 恢复UI
                    toggleUIInteraction(true);
                    
                    // 终止worker，释放资源
                    worker.terminate();
                });
            }
        };
        
        // 6. 遍历文件列表，将任务逐个发送给Worker
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

    // --- 裁剪逻辑 (与V2相同) ---
    // (此处省略了这部分代码以保持简洁，请直接使用V2版本的这部分代码)
    // 从 function loadForCropping(fileId) 开始
    // 到 downloadCroppedBtn.addEventListener('click', ...) 结束
    // --- START of V2 code to copy ---
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
    // --- END of V2 code to copy ---


    // --- 辅助函数 ---
    function toggleUIInteraction(isEnabled) {
        startConversionBtn.disabled = !isEnabled;
        clearAllBtn.disabled = !isEnabled;
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