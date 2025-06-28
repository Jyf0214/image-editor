/**
 * 高级图片处理器 - 主脚本 (V3.6 - 流水线修复最终版)
 *
 * 核心修复：
 * 彻底重构批量转换逻辑，从“一次性发送所有任务”改为“单任务流水线”模式。
 * 主线程发送一个任务 -> Worker处理 -> Worker返回结果 -> 主线程更新进度并发送下一个任务。
 * 这种模式确保了UI进度的实时、准确更新，解决了大批量处理时UI“假死”的问题。
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
        // 1. 全局元素获取与非空检查 (保持不变)
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

        for (const key in elements) {
            if (!elements[key]) {
                console.error(`初始化失败：关键DOM元素'${key}'未找到。`);
                document.body.innerHTML = '<p style="text-align: center; padding: 2rem; color: red;">页面加载失败，关键组件缺失。请联系管理员。</p>';
                return;
            }
        }

        // =======================================================
        // 2. 全局状态变量 (保持不变)
        // =======================================================
        let fileStore = [];
        let cropper = null;
        let selectedFileId = null;
        let worker = null;
        let isChangelogLoaded = false;

        // =======================================================
        // 3. 事件监听器绑定 (保持不变)
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
        // 4. 格式转换核心逻辑 (已重构为流水线模式)
        // =======================================================
        function startBatchConversion() {
            if (fileStore.length === 0) {
                alert("请先添加至少一张图片。");
                return;
            }

            toggleUIInteraction(false); // 禁用UI
            
            // --- 流水线设置 ---
            const tasks = [...fileStore]; // 创建一个待处理任务队列
            const zip = new JSZip();
            let processedCount = 0;
            const totalFiles = tasks.length;

            elements.progressText.textContent = `准备开始处理 ${totalFiles} 张图片...`;

            if (worker) worker.terminate();
            try {
                worker = new Worker('image-worker.js');
            } catch (e) {
                alert("错误：无法初始化后台处理模块(Web Worker)。\n" + e.message);
                toggleUIInteraction(true);
                return;
            }

            // 【流水线核心】当Worker发回消息时的处理逻辑
            worker.onmessage = (event) => {
                const { status, blob, name, message } = event.data;
                processedCount++;

                // 更新UI进度
                elements.progressText.textContent = `正在处理... (${processedCount}/${totalFiles})`;

                if (status === 'success') {
                    const originalName = name.split('.').slice(0, -1).join('.');
                    const ext = elements.formatSelect.value.split('/')[1];
                    zip.file(`${originalName}.${ext}`, blob); // 将处理好的文件添加到zip包
                } else {
                    console.error(`处理文件 ${name} 失败:`, message);
                }

                // 不论成功与否，都继续处理下一个任务
                processNextTask();
            };

            worker.onerror = (e) => {
                console.error('Web Worker 发生错误:', e);
                alert('后台处理发生严重错误，操作已中断。请检查浏览器控制台获取详细信息。');
                toggleUIInteraction(true);
                if (worker) worker.terminate();
                worker = null;
            };

            /**
             * @description 流水线的核心驱动函数
             */
            async function processNextTask() {
                // 检查任务队列是否还有任务
                if (tasks.length > 0) {
                    // 从队列头部取出一个任务
                    const task = tasks.shift(); 
                    
                    try {
                        const file = task.file;
                        // 将文件内容异步读取为 ArrayBuffer
                        const buffer = await file.arrayBuffer();

                        // 准备发送给Worker的数据
                        const format = elements.formatSelect.value;
                        const quality = format === 'image/png' ? undefined : parseFloat(elements.qualitySlider.value);

                        // 将数据“转移”给Worker，启动处理
                        worker.postMessage({
                            buffer: buffer,
                            type: file.type,
                            name: file.name,
                            format: format,
                            quality: quality
                        }, [buffer]); // [buffer]是实现零拷贝的关键

                    } catch (error) {
                        // 如果读取文件失败，手动触发一次 onmessage 来更新计数并继续
                        worker.onmessage({
                            data: {
                                status: 'error',
                                name: task.file.name,
                                message: '文件读取失败'
                            }
                        });
                    }
                } else {
                    // 所有任务都已发送并处理完毕
                    elements.progressText.textContent = '正在生成ZIP包，请稍候...';
                    
                    zip.generateAsync({ type: 'blob', compression: "DEFLATE" })
                        .then(content => {
                            downloadBlob(content, 'converted-images.zip');
                            toggleUIInteraction(true); // 恢复UI
                            if (worker) worker.terminate();
                            worker = null;
                        })
                        .catch(err => {
                            console.error("打包ZIP文件失败:", err);
                            alert("打包ZIP文件失败，请重试。");
                            toggleUIInteraction(true);
                        });
                }
            }

            // 【流水线启动】手动调用一次，开始处理第一个任务
            processNextTask();
        }


        // =======================================================
        // 5. 其他功能函数 (保持不变)
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