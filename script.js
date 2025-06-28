document.addEventListener('DOMContentLoaded', () => {
    // --- 元素获取 ---
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

    // 转换面板元素
    const formatSelect = document.getElementById('format-select');
    const qualityControl = document.getElementById('quality-control');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');
    const startConversionBtn = document.getElementById('start-conversion-btn');
    const processingIndicator = document.getElementById('processing-indicator');

    // 裁剪面板元素
    const cropPlaceholder = document.getElementById('crop-placeholder');
    const cropperContainer = document.getElementById('cropper-container');
    const imageToCrop = document.getElementById('image-to-crop');
    const downloadCroppedBtn = document.getElementById('download-cropped-btn');
    const resetCropBtn = document.getElementById('reset-crop-btn');

    // --- 状态管理 ---
    let fileStore = []; // 存储所有上传的 File 对象 { id, file, thumb }
    let cropper = null;
    let selectedFileId = null;

    // --- 文件上传处理 ---

    // 触发文件选择框
    browseBtn.addEventListener('click', () => imageInput.click());

    // 拖拽事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        handleFiles(files);
    });
    imageInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
        if (files.length === 0) return;
        
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            const fileId = Date.now() + '-' + file.name; // 创建唯一ID
            const fileObject = {
                id: fileId,
                file: file,
                thumb: URL.createObjectURL(file)
            };
            fileStore.push(fileObject);
        }
        
        updateFileListView();
        switchToWorkspaceView();
    }

    // --- UI 更新与视图切换 ---

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
            item.innerHTML = `
                <img src="${fileObj.thumb}" alt="${fileObj.file.name}">
                <div class="file-info">
                    <span class="name">${fileObj.file.name}</span>
                    <span class="size">${(fileObj.file.size / 1024).toFixed(1)} KB</span>
                </div>
            `;
            item.addEventListener('click', () => selectFile(fileObj.id));
            fileListContainer.appendChild(item);
        });

        // 默认选中第一个文件进行裁剪
        if (fileStore.length > 0 && !selectedFileId) {
            selectFile(fileStore[0].id);
        }
    }

    function selectFile(fileId) {
        selectedFileId = fileId;
        
        // 更新视觉高亮
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.id === fileId);
        });

        // 如果在裁剪标签页，则加载该图片
        if (cropPanel.classList.contains('active')) {
            loadForCropping(fileId);
        }
    }
    
    function switchToWorkspaceView() {
        uploadArea.classList.add('hidden');
        workspace.classList.remove('hidden');
    }

    function switchToUploadView() {
        fileStore = [];
        selectedFileId = null;
        imageInput.value = ''; // 清空选择，以便再次选择同名文件
        workspace.classList.add('hidden');
        uploadArea.classList.remove('hidden');
        if (cropper) cropper.destroy();
        cropper = null;
    }
    
    clearAllBtn.addEventListener('click', switchToUploadView);


    // --- 功能标签页切换 ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            // 更新按钮和面板的 active 状态
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(p => p.classList.add('hidden'));
            document.getElementById(`${tab}-panel`).classList.remove('hidden', 'active');
            document.getElementById(`${tab}-panel`).classList.add('active');

            if (tab === 'crop' && selectedFileId) {
                loadForCropping(selectedFileId);
            } else if (tab === 'crop' && fileStore.length === 0) {
                cropperContainer.classList.add('hidden');
                cropPlaceholder.classList.remove('hidden');
            }
        });
    });

    // --- 格式转换逻辑 ---
    formatSelect.addEventListener('change', () => {
        qualityControl.style.display = formatSelect.value === 'image/png' ? 'none' : 'block';
    });
    qualitySlider.addEventListener('input', () => {
        qualityValue.textContent = parseFloat(qualitySlider.value).toFixed(2);
    });

    startConversionBtn.addEventListener('click', async () => {
        if (fileStore.length === 0) return;
        
        processingIndicator.classList.remove('hidden');
        startConversionBtn.disabled = true;

        const zip = new JSZip();
        const format = formatSelect.value;
        const quality = parseFloat(qualitySlider.value);
        const ext = format.split('/')[1];

        const conversionPromises = fileStore.map(fileObj => {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        canvas.toBlob(blob => {
                            const originalName = fileObj.file.name.split('.').slice(0, -1).join('.');
                            zip.file(`${originalName}.${ext}`, blob);
                            resolve();
                        }, format, quality);
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(fileObj.file);
            });
        });

        await Promise.all(conversionPromises);

        zip.generateAsync({ type: "blob" }).then(content => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = "converted-images.zip";
            link.click();
            URL.revokeObjectURL(link.href);
            
            processingIndicator.classList.add('hidden');
            startConversionBtn.disabled = false;
        });
    });

    // --- 图片裁剪逻辑 ---
    function loadForCropping(fileId) {
        const fileObj = fileStore.find(f => f.id === fileId);
        if (!fileObj) return;

        cropPlaceholder.classList.add('hidden');
        cropperContainer.classList.remove('hidden');

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
    
    resetCropBtn.addEventListener('click', () => {
        if (cropper) cropper.reset();
    });

    downloadCroppedBtn.addEventListener('click', () => {
        if (!cropper || !selectedFileId) return;

        const fileObj = fileStore.find(f => f.id === selectedFileId);
        const canvas = cropper.getCroppedCanvas();
        const format = 'image/png'; // 裁剪默认输出高质量png，也可做成可选项
        const originalName = fileObj.file.name.split('.').slice(0, -1).join('.');
        
        canvas.toBlob(blob => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${originalName}-cropped.png`;
            link.click();
            URL.revokeObjectURL(link.href);
        }, format);
    });
});