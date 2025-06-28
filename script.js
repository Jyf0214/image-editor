/**
 * 高级图片处理器 - 主脚本 (V3.4 - 移动端修复版)
 * 修复了移动端布局问题和内容加载的健壮性。
 */

// 采用立即执行函数表达式(IIFE)来创建独立作用域，避免污染全局
(function() {
    // 等待整个网页的DOM结构加载完成后再执行初始化函数
    document.addEventListener('DOMContentLoaded', init);

    /**
     * @description 所有应用的初始化逻辑都从这里开始
     */
    function init() {
        // =======================================================
        // 1. 全局元素获取与非空检查 (健壮性修复)
        // =======================================================
        const elements = {
            uploadArea: document.getElementById('upload-area'),
            dropZone: document.getElementById('drop-zone'),
            imageInput: document.getElementById('image-input'),
            browseBtn: document.getElementById('browse-btn'),
            workspace: document.getElementById('workspace'),
            fileListContainer: document.getElementById('file-list'),
            clearAllBtn: document.getElementById('clear-all-btn'),
            tabBtns: document.querySelectorAll('.tab-btn'),
            convertPanel: document.getElementById('convert-panel'),
            cropPanel: document.getElementById('crop-panel'),
            formatSelect: document.getElementById('format-select'),
            qualityControl: document.getElementById('quality-control'),
            qualitySlider: document.getElementById('quality-slider'),
            qualityValue: document.getElementById('quality-value'),
            startConversionBtn: document.getElementById('start-conversion-btn'),
            loadingOverlay: document.getElementById('loading-overlay'),
            progressText: document.getElementById('progress-text'),
            cropPlaceholder: document.getElementById('crop-placeholder'),
            cropperContainer: document.getElementById('cropper-container'),
            imageToCrop: document.getElementById('image-to-crop'),
            downloadCroppedBtn: document.getElementById('download-cropped-btn'),
            resetCropBtn: document.getElementById('reset-crop-btn'),
            showChangelogLink: document.getElementById('show-changelog-link'),
            changelogModal: document.getElementById('changelog-modal'),
            changelogContentArea: document.getElementById('changelog-content-area'),
            modalCloseBtn: document.querySelector('#changelog-modal .modal-close-btn'),
        };

        // 健壮性检查：确保所有关键元素都存在
        for (const key in elements) {
            if (!elements[key]) {
                console.error(`初始化失败：关键DOM元素'${key}'未找到。请检查HTML结构。`);
                // 可以在这里向用户显示一个更友好的错误信息
                document.body.innerHTML = '<p style="text-align: center; padding: 2rem; color: red;">页面加载失败，关键组件缺失。请联系管理员。</p>';
                return; // 终止脚本执行
            }
        }

        // =======================================================
        // 2. 全局状态变量
        // =======================================================
        let fileStore = [];
        let cropper = null;
        let selectedFileId = null;
        let worker = null;
        let isChangelogLoaded = false;

        // =======================================================
        // 3. 事件监听器绑定
        // =======================================================
        elements.browseBtn.addEventListener('click', () => elements.imageInput.click());
        elements.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); elements.dropZone.classList.add('dragover'); });
        elements.dropZone.addEventListener('dragleave', () => elements.dropZone.classList.remove('dragover'));
        elements.dropZone.addEventListener('drop', (e) => { e.preventDefault(); elements.dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
        elements.imageInput.addEventListener('change', (e) => handleFiles(e.target.files));

        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                const tab = btn.dataset.tab;
                elements.tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(p => p.classList.add('hidden'));
                document.getElementById(`${tab}-panel`).classList.remove('hidden');
                if (tab === 'crop' && selectedFileId) loadForCropping(selectedFileId);
            });
        });

        elements.clearAllBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有文件吗？此操作不可撤销。')) switchToUploadView();
        });

        elements.formatSelect.addEventListener('change', () => { elements.qualityControl.style.display = elements.formatSelect.value === 'image/png' ? 'none' : 'block'; });
        elements.qualitySlider.addEventListener('input', () => { elements.qualityValue.textContent = parseFloat(elements.qualitySlider.value).toFixed(2); });
        elements.startConversionBtn.addEventListener('click', startBatchConversion);
        elements.resetCropBtn.addEventListener('click', () => { if (cropper) cropper.reset(); });
        elements.downloadCroppedBtn.addEventListener('click', downloadCroppedImage);
        
        elements.showChangelogLink.addEventListener('click', (e) => { e.preventDefault(); openChangelogModal(); });
        elements.modalCloseBtn.addEventListener('click', closeChangelogModal);
        elements.changelogModal.addEventListener('click', (e) => { if (e.target === elements.changelogModal) closeChangelogModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChangelogModal(); });


        // =======================================================
        // 4. 功能函数定义 (与上一版相同，但使用 elements 对象)
        // =======================================================

        function handleFiles(files) {
            if (files.length === 0) return;
            const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
            if(imageFiles.length === 0) {
                alert("未检测到有效的图片文件。请选择PNG, JPEG, WEBP等格式的图片。");
                return;
            }
            for (const file of imageFiles) {
                const fileId = Date.now() + '-' + file.name;
                const fileObject = { id: fileId, file: file, thumb: URL.createObjectURL(file) };
                fileStore.push(fileObject);
            }
            updateFileListView();
            switchToWorkspaceView();
        }

        function updateFileListView() {
            elements.fileListContainer.innerHTML = '';
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
                elements.fileListContainer.appendChild(item);
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
            if (elements.cropPanel.classList.contains('active')) {
                loadForCropping(fileId);
            }
        }

        function switchToWorkspaceView() {
            elements.uploadArea.classList.add('hidden');
            elements.workspace.classList.remove('hidden');
        }

        function switchToUploadView() {
            fileStore.forEach(f => URL.revokeObjectURL(f.thumb));
            fileStore = [];
            selectedFileId = null;
            elements.imageInput.value = '';
            elements.workspace.classList.add('hidden');
            elements.uploadArea.classList.remove('hidden');
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
        }

        function startBatchConversion() {
            if (fileStore.length === 0) {
                alert("请先添加至少一张图片。");
                return;
            }
            toggleUIInteraction(false);
            elements.progressText.textContent = `准备开始处理 ${fileStore.length} 张图片...`;
            const zip = new JSZip();
            let processedCount = 0;
            const totalFiles = fileStore.length;
            if (worker) worker.terminate();
            try {
                worker = new Worker('image-worker.js');
            } catch (e) {
                alert("错误：无法初始化后台处理模块(Web Worker)。\n" + e.message);
                toggleUIInteraction(true);
                return;
            }
            worker.onmessage = (event) => {
                const { status, blob, name, message } = event.data;
                processedCount++;
                elements.progressText.textContent = `正在处理... (${processedCount}/${totalFiles})`;
                if (status === 'success') {
                    const originalName = name.split('.').slice(0, -1).join('.');
                    const ext = elements.formatSelect.value.split('/')[1];
                    zip.file(`${originalName}.${ext}`, blob);
                } else {
                    console.error(`处理文件 ${name} 失败:`, message);
                }
                if (processedCount === totalFiles) {
                    elements.progressText.textContent = '正在生成ZIP包，请稍候...';
                    zip.generateAsync({ type: 'blob', compression: "DEFLATE" }).then(content => {
                        downloadBlob(content, 'converted-images.zip');
                        toggleUIInteraction(true);
                        worker.terminate();
                        worker = null;
                    });
                }
            };
            worker.onerror = (e) => {
                console.error('Web Worker 发生错误:', e);
                alert('后台处理发生严重错误，操作已中断。请检查浏览器控制台获取详细信息。');
                toggleUIInteraction(true);
                if (worker) worker.terminate();
                worker = null;
            };
            const format = elements.formatSelect.value;
            const quality = format === 'image/png' ? undefined : parseFloat(elements.qualitySlider.value);
            fileStore.forEach(fileObj => {
                worker.postMessage({ file: fileObj.file, format: format, quality: quality });
            });
        }

        function loadForCropping(fileId) {
            const fileObj = fileStore.find(f => f.id === fileId);
            if (!fileObj) {
                elements.cropperContainer.classList.add('hidden');
                elements.cropPlaceholder.classList.remove('hidden');
                return;
            }
            elements.cropPlaceholder.classList.add('hidden');
            elements.cropperContainer.classList.remove('hidden');
            if (cropper) {
                cropper.replace(fileObj.thumb);
            } else {
                elements.imageToCrop.src = fileObj.thumb;
                cropper = new Cropper(elements.imageToCrop, {
                    viewMode: 1,
                    background: false,
                    autoCropArea: 0.8,
                });
            }
        }

        function downloadCroppedImage() {
            if (!cropper || !selectedFileId) return;
            const fileObj = fileStore.find(f => f.id === selectedFileId);
            const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
            const format = 'image/png'; 
            const originalName = fileObj.file.name.split('.').slice(0, -1).join('.');
            canvas.toBlob(blob => {
                downloadBlob(blob, `${originalName}-cropped.png`);
            }, format);
        }
        
        function openChangelogModal() {
            elements.changelogModal.classList.add('visible');
            if (!isChangelogLoaded) {
                loadChangelog();
            }
        }

        function closeChangelogModal() {
            elements.changelogModal.classList.remove('visible');
        }

        async function loadChangelog() {
            isChangelogLoaded = true;
            elements.changelogContentArea.innerHTML = '<p>正在加载更新日志...</p>';
            try {
                const response = await fetch('changelog.md');
                if (!response.ok) throw new Error(`HTTP 错误! 状态码: ${response.status}`);
                const markdownText = await response.text();
                const rawHtml = marked.parse(markdownText);
                const sanitizedHtml = DOMPurify.sanitize(rawHtml);
                elements.changelogContentArea.innerHTML = sanitizedHtml;
            } catch (error) {
                console.error('加载更新日志失败:', error);
                elements.changelogContentArea.innerHTML = '<p style="color: red;">抱歉，无法加载更新日志。请检查网络连接或刷新页面重试。</p>';
            }
        }

        function toggleUIInteraction(isEnabled) {
            elements.startConversionBtn.disabled = !isEnabled;
            elements.clearAllBtn.disabled = !isEnabled;
            elements.tabBtns.forEach(btn => btn.disabled = !isEnabled);
            elements.loadingOverlay.classList.toggle('hidden', isEnabled);
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
    }
})();