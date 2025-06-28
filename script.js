/**
 * 高级图片处理器 - 主脚本 (V3.7 - 缩略图懒加载最终修复版)
 *
 * 核心修复：
 * 解决了在选择大量图片时（加载预览阶段）导致的UI线程卡死问题。
 * 1. 引入 IntersectionObserver API 实现图片缩略图的懒加载。
 * 2. 在文件被选中时，不再立即为所有文件创建 createObjectURL。
 * 3. 只有当图片滚动到视区内时，才动态生成其缩略图URL并显示。
 * 4. 这确保了即使选择上千张图片，应用也能瞬间响应，提供流畅的加载和滚动体验。
 */

// 采用立即执行函数表达式(IIFE)来创建独立作用域
(function() {
    // 等待整个网页的DOM结构加载完成后再执行初始化函数
    document.addEventListener('DOMContentLoaded', init);

    /**
     * @description 所有应用的初始化逻辑都从这里开始
     */
    function init() {
        // =======================================================
        // 1. 全局元素获取 (保持不变)
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
            // ... 其他元素与上一版相同
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

        // 健壮性检查 (保持不变)
        for (const key in elements) {
            if (!elements[key]) {
                console.error(`初始化失败：关键DOM元素'${key}'未找到。`);
                document.body.innerHTML = '<p style="text-align: center; padding: 2rem; color: red;">页面加载失败，关键组件缺失。请联系管理员。</p>';
                return;
            }
        }
        
        // =======================================================
        // 2. 全局状态变量 (新增 thumbnailObserver)
        // =======================================================
        let fileStore = [];
        let cropper = null;
        let selectedFileId = null;
        let worker = null;
        let isChangelogLoaded = false;
        let thumbnailObserver = null; // 【新增】用于懒加载的交叉观察器实例

        // =======================================================
        // 3. 事件监听器绑定 (保持不变)
        // =======================================================
        elements.browseBtn.addEventListener('click', () => elements.imageInput.click());
        // ... 其他事件监听器与上一版相同
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
        // 4. 文件加载与预览核心逻辑 (已重构为懒加载)
        // =======================================================

        /**
         * @description 处理用户选择或拖拽的文件 (已重构)
         */
        function handleFiles(files) {
            if (files.length === 0) return;
            const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
            if(imageFiles.length === 0) {
                alert("未检测到有效的图片文件。");
                return;
            }

            for (const file of imageFiles) {
                const fileId = Date.now() + '-' + file.name;
                // 【核心改动】此时不生成URL，将thumb设为null，表示“待加载”
                const fileObject = { id: fileId, file: file, thumb: null }; 
                fileStore.push(fileObject);
            }
            
            // 切换到工作区并渲染列表（此时会非常快，因为没有IO操作）
            updateFileListView();
            switchToWorkspaceView();
        }

        /**
         * @description 更新左侧的文件列表视图 (已重构)
         */
        function updateFileListView() {
            elements.fileListContainer.innerHTML = '';
            if (fileStore.length === 0) {
                switchToUploadView();
                return;
            }

            // 【核心改动】在渲染列表前，先断开旧的观察器
            if (thumbnailObserver) {
                thumbnailObserver.disconnect();
            }
            
            const placeholderSrc = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1x1透明GIF占位符

            // 渲染列表项，img的src使用占位符
            fileStore.forEach(fileObj => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.dataset.id = fileObj.id;
                // 【核心改动】使用占位符，并添加 'lazy-thumb' 类和 'data-file-id' 属性
                item.innerHTML = `
                    <img src="${placeholderSrc}" class="lazy-thumb" data-file-id="${fileObj.id}" alt="预览图加载中...">
                    <div class="file-info">
                        <span class="name">${fileObj.file.name}</span>
                        <span class="size">${(fileObj.file.size / 1024).toFixed(1)} KB</span>
                    </div>`;
                item.addEventListener('click', () => selectFile(fileObj.id));
                elements.fileListContainer.appendChild(item);
            });
            
            // 【核心改动】创建新的观察器并开始观察所有新的占位图
            setupThumbnailObserver();

            // 智能选择文件（逻辑不变）
            if (fileStore.length > 0 && (!selectedFileId || !fileStore.find(f => f.id === selectedFileId))) {
                selectFile(fileStore[0].id);
            } else if (selectedFileId) {
                selectFile(selectedFileId);
            }
        }
        
        /**
         * @description 【新增】设置并启动缩略图懒加载观察器
         */
        function setupThumbnailObserver() {
            const lazyImages = elements.fileListContainer.querySelectorAll('.lazy-thumb');
            
            // IntersectionObserver 配置
            const options = {
                root: elements.fileListContainer, // 观察的根容器是文件列表本身
                rootMargin: '100px', // 提前100px开始加载，滚动体验更平滑
                threshold: 0.01 // 元素出现一点点就触发
            };

            thumbnailObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    // 如果元素进入视区
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const fileId = img.dataset.fileId;
                        const fileObj = fileStore.find(f => f.id === fileId);

                        // 仅当图片未加载时才处理
                        if (fileObj && !fileObj.thumb) {
                            // 【核心改动】在此处才生成URL
                            fileObj.thumb = URL.createObjectURL(fileObj.file);
                            img.src = fileObj.thumb;
                            img.classList.remove('lazy-thumb'); // 移除懒加载类，停止动画
                        }
                        
                        // 【核心改动】加载后，停止观察此图片，提升性能
                        observer.unobserve(img);
                    }
                });
            }, options);

            // 让观察器开始观察所有懒加载图片
            lazyImages.forEach(img => thumbnailObserver.observe(img));
        }

        /**
         * @description 清理视图和状态 (已重构)
         */
        function switchToUploadView() {
            // 【核心改动】断开观察器连接，防止内存泄漏
            if (thumbnailObserver) {
                thumbnailObserver.disconnect();
                thumbnailObserver = null;
            }

            // 释放所有已生成的缩略图URL
            fileStore.forEach(f => {
                if (f.thumb) {
                    URL.revokeObjectURL(f.thumb);
                }
            });
            
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

        /**
         * @description 为裁剪面板加载图片 (已重构)
         */
        function loadForCropping(fileId) {
            const fileObj = fileStore.find(f => f.id === fileId);
            if (!fileObj) {
                // ... 省略 ...
                return;
            }
            
            // 【核心改动】如果缩略图还未生成，先手动生成它
            if (!fileObj.thumb) {
                fileObj.thumb = URL.createObjectURL(fileObj.file);
                // 更新列表中对应的img元素的src
                const imgElement = elements.fileListContainer.querySelector(`img[data-file-id="${fileId}"]`);
                if (imgElement) {
                    imgElement.src = fileObj.thumb;
                    imgElement.classList.remove('lazy-thumb');
                }
            }

            // 后续逻辑不变
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

        // =======================================================
        // 5. 其他功能函数 (保持不变)
        // =======================================================
        // 此处省略了 selectFile, startBatchConversion, downloadCroppedImage,
        // modal相关函数, toggleUIInteraction, downloadBlob 等。
        // 它们的代码与上一版完全相同，请直接保留即可。
        // 为确保完整性，下面将它们全部粘贴出来。
        function selectFile(fileId) {
            selectedFileId = fileId;
            document.querySelectorAll('.file-item').forEach(item => item.classList.toggle('selected', item.dataset.id === fileId));
            if (elements.cropPanel.classList.contains('active')) {
                loadForCropping(fileId);
            }
        }
        function startBatchConversion() {
            if (fileStore.length === 0) { alert("请先添加至少一张图片。"); return; }
            toggleUIInteraction(false);
            const tasks = [...fileStore];
            const zip = new JSZip();
            let processedCount = 0;
            const totalFiles = tasks.length;
            elements.progressText.textContent = `准备开始处理 ${totalFiles} 张图片...`;
            if (worker) worker.terminate();
            try { worker = new Worker('image-worker.js'); } 
            catch (e) { alert("错误：无法初始化后台处理模块(Web Worker)。\n" + e.message); toggleUIInteraction(true); return; }
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
                if (worker) worker.terminate();
                worker = null;
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
                        if (worker) worker.terminate();
                        worker = null;
                    }).catch(err => {
                        console.error("打包ZIP文件失败:", err);
                        alert("打包ZIP文件失败，请重试。");
                        toggleUIInteraction(true);
                    });
                }
            }
            processNextTask();
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
            if (!isChangelogLoaded) { loadChangelog(); }
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