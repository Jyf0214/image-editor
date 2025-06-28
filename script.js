/**
 * 高级图片处理器 - 主脚本 (V3.7 - 列表加载优化最终版)
 *
 * 核心修复：
 * 1. 引入文件列表分块加载机制，解决选择大量文件时因同时渲染过多缩略图导致的UI卡死问题。
 * 2. 新增“加载更多”按钮，实现按需加载文件列表。
 * 3. 重构文件处理流程，确保从选择文件到最终处理的全过程流畅无卡顿。
 */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        // =======================================================
        // 1. 全局元素获取与非空检查
        // =======================================================
        const elements = {
            uploadArea: document.getElementById('upload-area'),
            dropZone: document.getElementById('drop-zone'),
            imageInput: document.getElementById('image-input'),
            browseBtn: document.getElementById('browse-btn'),
            workspace: document.getElementById('workspace'),
            fileListContainer: document.getElementById('file-list'),
            loadMoreBtn: document.getElementById('load-more-btn'), // 新增
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

        for (const key in elements) {
            if (!elements[key]) {
                console.error(`初始化失败：关键DOM元素'${key}'未找到。`);
                document.body.innerHTML = '<p style="text-align: center; padding: 2rem; color: red;">页面加载失败，关键组件缺失。请联系管理员。</p>';
                return;
            }
        }

        // =======================================================
        // 2. 全局状态变量与常量
        // =======================================================
        let fileStore = [];
        let cropper = null;
        let selectedFileId = null;
        let worker = null;
        let isChangelogLoaded = false;
        let fileListPage = 1; // 用于文件列表分页
        const FILES_PER_PAGE = 30; // 每页（每批次）加载的文件数量

        // =======================================================
        // 3. 事件监听器绑定
        // =======================================================
        elements.browseBtn.addEventListener('click', () => elements.imageInput.click());
        elements.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); elements.dropZone.classList.add('dragover'); });
        elements.dropZone.addEventListener('dragleave', () => elements.dropZone.classList.remove('dragover'));
        elements.dropZone.addEventListener('drop', (e) => { e.preventDefault(); elements.dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
        elements.imageInput.addEventListener('change', (e) => handleFiles(e.target.files));
        elements.loadMoreBtn.addEventListener('click', renderNextFileChunk); // 新增

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
        // 4. 核心功能函数
        // =======================================================

        /**
         * @description 处理用户选择的文件，只存储数据，渲染交给分块函数
         */
        function handleFiles(files) {
            if (files.length === 0) return;
            const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
            if (imageFiles.length === 0) {
                alert("未检测到有效的图片文件。请选择PNG, JPEG, WEBP等格式的图片。");
                return;
            }
            // 存入仓库
            for (const file of imageFiles) {
                const fileId = Date.now() + '-' + file.name + Math.random();
                const fileObject = { id: fileId, file: file, thumb: null }; // 缩略图URL延迟创建
                fileStore.push(fileObject);
            }
            
            // 重置视图和分页
            fileListPage = 1;
            elements.fileListContainer.innerHTML = '';
            
            // 渲染第一批
            renderFileChunk();
            
            switchToWorkspaceView();
        }

        /**
         * @description 渲染下一批文件列表
         */
        function renderNextFileChunk() {
            fileListPage++;
            renderFileChunk();
        }

        /**
         * @description 渲染指定批次的文件到DOM中
         */
        function renderFileChunk() {
            const startIndex = (fileListPage - 1) * FILES_PER_PAGE;
            const endIndex = fileListPage * FILES_PER_PAGE;
            const chunk = fileStore.slice(startIndex, endIndex);

            if (chunk.length === 0) {
                elements.loadMoreBtn.classList.add('hidden');
                return;
            }

            const fragment = document.createDocumentFragment();
            for (const fileObj of chunk) {
                // 仅在需要渲染时才创建缩略图URL
                if (!fileObj.thumb) {
                    fileObj.thumb = URL.createObjectURL(fileObj.file);
                }

                const item = document.createElement('div');
                item.className = 'file-item';
                item.dataset.id = fileObj.id;
                item.innerHTML = `<img src="${fileObj.thumb}" alt="${fileObj.file.name}"><div class="file-info"><span class="name">${fileObj.file.name}</span><span class="size">${(fileObj.file.size / 1024).toFixed(1)} KB</span></div>`;
                item.addEventListener('click', () => selectFile(fileObj.id));
                fragment.appendChild(item);
            }
            elements.fileListContainer.appendChild(fragment);

            // 如果是第一批，则默认选中第一个文件
            if (startIndex === 0 && fileStore.length > 0) {
                selectFile(fileStore[0].id);
            }

            // 更新“加载更多”按钮的可见性
            if (endIndex < fileStore.length) {
                elements.loadMoreBtn.classList.remove('hidden');
            } else {
                elements.loadMoreBtn.classList.add('hidden');
            }
        }
        
        function selectFile(fileId) {
            // 首先检查DOM中是否存在该元素
            const itemInDom = elements.fileListContainer.querySelector(`.file-item[data-id="${fileId}"]`);
            if(!itemInDom) {
                // 如果文件不在当前渲染的列表中，不执行选择操作，或给出提示
                console.warn("尝试选择一个尚未渲染到列表中的文件。");
                return;
            }

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
            fileStore.forEach(f => {
                if (f.thumb) URL.revokeObjectURL(f.thumb);
            });
            fileStore = [];
            selectedFileId = null;
            elements.imageInput.value = '';
            elements.workspace.classList.add('hidden');
            elements.uploadArea.classList.remove('hidden');
            elements.loadMoreBtn.classList.add('hidden'); // 确保隐藏“加载更多”
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
        }

        // --- 批量转换的流水线逻辑 (与v3.6完全相同，无需修改) ---
        function startBatchConversion() {
            if (fileStore.length === 0) { alert("请先添加至少一张图片。"); return; }
            toggleUIInteraction(false);
            const tasks = [...fileStore];
            const zip = new JSZip();
            let processedCount = 0;
            const totalFiles = tasks.length;
            elements.progressText.textContent = `准备开始处理 ${totalFiles} 张图片...`;
            if (worker) worker.terminate();
            try { worker = new Worker('image-worker.js'); } catch (e) { alert("错误：无法初始化后台处理模块(Web Worker)。\n" + e.message); toggleUIInteraction(true); return; }
            worker.onmessage = (event) => {
                const { status, blob, name, message } = event.data;
                processedCount++;
                elements.progressText.textContent = `正在处理... (${processedCount}/${totalFiles})`;
                if (status === 'success') {
                    const originalName = name.split('.').slice(0, -1).join('.');
                    const ext = elements.formatSelect.value.split('/')[1];
                    zip.file(`${originalName}.${ext}`, blob);
                } else { console.error(`处理文件 ${name} 失败:`, message); }
                processNextTask();
            };
            worker.onerror = (e) => {
                console.error('Web Worker 发生错误:', e);
                alert('后台处理发生严重错误，操作已中断。');
                toggleUIInteraction(true);
                if (worker) worker.terminate(); worker = null;
            };
            async function processNextTask() {
                if (tasks.length > 0) {
                    const task = tasks.shift();
                    try {
                        const file = task.file;
                        const buffer = await file.arrayBuffer();
                        const format = elements.formatSelect.value;
                        const quality = format === 'image/png' ? undefined : parseFloat(elements.qualitySlider.value);
                        worker.postMessage({ buffer, type: file.type, name: file.name, format, quality }, [buffer]);
                    } catch (error) {
                        worker.onmessage({ data: { status: 'error', name: task.file.name, message: '文件读取失败' } });
                    }
                } else {
                    elements.progressText.textContent = '正在生成ZIP包，请稍候...';
                    zip.generateAsync({ type: 'blob', compression: "DEFLATE" }).then(content => {
                        downloadBlob(content, 'converted-images.zip');
                        toggleUIInteraction(true);
                        if (worker) worker.terminate(); worker = null;
                    }).catch(err => {
                        console.error("打包ZIP文件失败:", err);
                        alert("打包ZIP文件失败，请重试。");
                        toggleUIInteraction(true);
                    });
                }
            }
            processNextTask();
        }

        // --- 其他辅助函数 (保持不变) ---
        function loadForCropping(fileId) {
            const fileObj = fileStore.find(f => f.id === fileId);
            if (!fileObj) { elements.cropperContainer.classList.add('hidden'); elements.cropPlaceholder.classList.remove('hidden'); return; }
            elements.cropPlaceholder.classList.add('hidden');
            elements.cropperContainer.classList.remove('hidden');
            // 确保在需要时才创建缩略图URL
            if (!fileObj.thumb) { fileObj.thumb = URL.createObjectURL(fileObj.file); }
            if (cropper) { cropper.replace(fileObj.thumb); } else {
                elements.imageToCrop.src = fileObj.thumb;
                cropper = new Cropper(elements.imageToCrop, { viewMode: 1, background: false, autoCropArea: 0.8 });
            }
        }
        function downloadCroppedImage() {
            if (!cropper || !selectedFileId) return;
            const fileObj = fileStore.find(f => f.id === selectedFileId);
            const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
            const format = 'image/png';
            const originalName = fileObj.file.name.split('.').slice(0, -1).join('.');
            canvas.toBlob(blob => { downloadBlob(blob, `${originalName}-cropped.png`); }, format);
        }
        function openChangelogModal() {
            elements.changelogModal.classList.add('visible');
            if (!isChangelogLoaded) loadChangelog();
        }
        function closeChangelogModal() { elements.changelogModal.classList.remove('visible'); }
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
                elements.changelogContentArea.innerHTML = '<p style="color: red;">抱歉，无法加载更新日志。</p>';
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