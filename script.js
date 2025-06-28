// 等待DOM内容完全加载后再执行脚本
document.addEventListener('DOMContentLoaded', () => {

    // 获取所有需要的HTML元素
    const imageInput = document.getElementById('image-input');
    const editorArea = document.getElementById('editor-area');
    const placeholder = document.getElementById('placeholder');
    const imageToCrop = document.getElementById('image-to-crop');
    
    const formatSelect = document.getElementById('format-select');
    const qualityControl = document.getElementById('quality-control');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');

    const processBtn = document.getElementById('process-btn');
    const resetCropBtn = document.getElementById('reset-crop-btn');

    let cropper = null; // 用于存储Cropper.js实例
    let originalFileName = ''; // 存储原始文件名

    // 1. 当用户选择文件时触发
    imageInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return; // 如果用户未选择文件则不执行任何操作
        }

        // 检查文件类型是否为图片
        if (!file.type.startsWith('image/')) {
            alert('请选择一个图片文件！');
            return;
        }

        // 保存原始文件名（不含扩展名）
        originalFileName = file.name.split('.').slice(0, -1).join('.');

        const reader = new FileReader();

        // 文件读取完成后
        reader.onload = (e) => {
            // 将图片数据显示在img标签中
            imageToCrop.src = e.target.result;

            // 显示编辑区域，隐藏提示信息
            editorArea.classList.remove('hidden');
            placeholder.classList.add('hidden');

            // 如果已有Cropper实例，先销毁
            if (cropper) {
                cropper.destroy();
            }

            // 初始化Cropper.js
            cropper = new Cropper(imageToCrop, {
                aspectRatio: NaN, // 自由裁剪比例
                viewMode: 1,      // 限制裁剪框不能超出图片范围
                dragMode: 'move', // 可以移动图片
                background: false, // 不显示网格背景
                autoCropArea: 0.8, // 初始裁剪区域占80%
            });
        };

        // 以Data URL的形式读取文件
        reader.readAsDataURL(file);
    });

    // 2. 当格式选择变化时，控制质量滑块的显示/隐藏
    formatSelect.addEventListener('change', () => {
        const selectedFormat = formatSelect.value;
        // JPEG 和 WEBP 格式支持质量设置
        if (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp') {
            qualityControl.style.display = 'block';
        } else {
            qualityControl.style.display = 'none';
        }
    });

    // 3. 更新质量滑块旁边的数值显示
    qualitySlider.addEventListener('input', () => {
        qualityValue.textContent = qualitySlider.value;
    });

    // 4. 重置裁剪框
    resetCropBtn.addEventListener('click', () => {
        if (cropper) {
            cropper.reset();
        }
    });

    // 5. 点击 "转换并下载" 按钮
    processBtn.addEventListener('click', () => {
        if (!cropper) {
            alert('请先上传一张图片！');
            return;
        }

        // 获取裁剪后的Canvas对象
        const canvas = cropper.getCroppedCanvas();

        if (!canvas) {
            alert('无法获取裁剪区域，请重试。');
            return;
        }
        
        const format = formatSelect.value;
        const quality = parseFloat(qualitySlider.value);
        
        // 从Canvas生成目标格式的Data URL
        let outputDataUrl;
        if (format === 'image/jpeg' || format === 'image/webp') {
            outputDataUrl = canvas.toDataURL(format, quality);
        } else {
            // PNG格式不支持质量参数
            outputDataUrl = canvas.toDataURL(format);
        }

        // 创建一个临时的下载链接
        const link = document.createElement('a');
        link.href = outputDataUrl;

        // 生成下载文件名
        const extension = format.split('/')[1];
        link.download = `${originalFileName}-edited.${extension}`;

        // 触发点击事件以下载文件
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});
