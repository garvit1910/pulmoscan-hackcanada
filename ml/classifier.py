"""
Phase 4a — Lung Cancer Classifier

EfficientNet-B0 pretrained on ImageNet, fine-tuned on the chest CT-scan
PNG dataset (4 classes). Also provides GradCAM for pathology localisation.

Classes (alphabetical = torchvision ImageFolder order):
    0: adenocarcinoma
    1: large_cell_carcinoma
    2: normal
    3: squamous_cell_carcinoma
"""

import logging
from typing import Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torchvision.models as models
import torchvision.transforms as T
from PIL import Image

logger = logging.getLogger(__name__)

# Canonical class ordering — must match torchvision.datasets.ImageFolder alphabetical sort
CLASSES = {
    0: "adenocarcinoma",
    1: "large_cell_carcinoma",
    2: "normal",
    3: "squamous_cell_carcinoma",
}
CLASS_TO_IDX = {v: k for k, v in CLASSES.items()}
NUM_CLASSES = len(CLASSES)

# ImageNet normalisation (backbone was pretrained on ImageNet)
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

INFERENCE_TRANSFORM = T.Compose([
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

class LungCancerClassifier(nn.Module):
    """EfficientNet-B0 backbone with a 4-class classification head."""

    def __init__(self, num_classes: int = NUM_CLASSES):
        super().__init__()
        self.backbone = models.efficientnet_b0(weights="IMAGENET1K_V1")
        in_features = self.backbone.classifier[1].in_features
        self.backbone.classifier = nn.Sequential(
            nn.Dropout(p=0.3, inplace=True),
            nn.Linear(in_features, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)


# ---------------------------------------------------------------------------
# Checkpoint helpers
# ---------------------------------------------------------------------------

def save_checkpoint(model: LungCancerClassifier, path: str, epoch: int,
                    val_acc: float, class_to_idx: dict) -> None:
    """Save model weights + metadata so inference never assumes class ordering."""
    import os
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    torch.save({
        "epoch":           epoch,
        "model_state_dict": model.state_dict(),
        "val_acc":         val_acc,
        "class_to_idx":    class_to_idx,   # critical: embed dataset mapping
    }, path)
    logger.info("Saved checkpoint: %s  (epoch=%d, val_acc=%.3f)", path, epoch, val_acc)


def load_checkpoint(path: str, device: Optional[torch.device] = None) -> Tuple[LungCancerClassifier, dict]:
    """
    Load a saved checkpoint.

    Returns:
        (model, class_to_idx)  — class_to_idx from the checkpoint, not hardcoded
    """
    if device is None:
        device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

    checkpoint = torch.load(path, map_location=device)
    model = LungCancerClassifier(num_classes=NUM_CLASSES)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()

    class_to_idx = checkpoint.get("class_to_idx", CLASS_TO_IDX)
    idx_to_class = {v: k for k, v in class_to_idx.items()}

    logger.info(
        "Loaded checkpoint: %s  (epoch=%d, val_acc=%.3f)",
        path,
        checkpoint.get("epoch", -1),
        checkpoint.get("val_acc", 0.0),
    )
    return model, idx_to_class


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

def predict_slice(
    model: LungCancerClassifier,
    pil_image: Image.Image,
    device: torch.device,
    idx_to_class: dict,
) -> Tuple[str, float]:
    """
    Run inference on a single PIL image (CT axial slice as RGB).

    Returns:
        (predicted_class_name, confidence_0_to_1)
    """
    tensor = INFERENCE_TRANSFORM(pil_image).unsqueeze(0).to(device)
    with torch.no_grad():
        logits = model(tensor)
        probs  = torch.softmax(logits, dim=1)[0]
    pred_idx  = int(probs.argmax())
    confidence = float(probs[pred_idx])
    class_name = idx_to_class.get(pred_idx, f"class_{pred_idx}")
    return class_name, confidence


def hu_slice_to_pil(slice_hu: np.ndarray) -> Image.Image:
    """
    Convert a 2D HU array to an 8-bit RGB PIL image using a lung window.

    Lung window: centre -600 HU, width 1500 HU → [-1350, 150]
    """
    wl, ww = -600, 1500
    lo, hi = wl - ww / 2, wl + ww / 2
    clipped = np.clip(slice_hu.astype(np.float32), lo, hi)
    normalised = ((clipped - lo) / (hi - lo) * 255).astype(np.uint8)
    rgb = np.stack([normalised] * 3, axis=-1)
    return Image.fromarray(rgb, mode="RGB")


# ---------------------------------------------------------------------------
# GradCAM
# ---------------------------------------------------------------------------

class GradCAM:
    """
    Gradient-weighted Class Activation Mapping for EfficientNet-B0.

    Hooks into backbone.features[-1] (the last MBConv block output).
    """

    def __init__(self, model: LungCancerClassifier, device: torch.device):
        self.model  = model
        self.device = device
        self._activations: Optional[torch.Tensor] = None
        self._gradients:   Optional[torch.Tensor] = None
        self._hook_handles = []

    def _register_hooks(self):
        target_layer = self.model.backbone.features[-1]

        def forward_hook(module, input, output):
            self._activations = output.detach()

        def backward_hook(module, grad_input, grad_output):
            self._gradients = grad_output[0].detach()

        self._hook_handles.append(target_layer.register_forward_hook(forward_hook))
        self._hook_handles.append(target_layer.register_full_backward_hook(backward_hook))

    def _remove_hooks(self):
        for h in self._hook_handles:
            h.remove()
        self._hook_handles.clear()

    def compute(
        self,
        pil_image: Image.Image,
        target_class: Optional[int] = None,
    ) -> Tuple[np.ndarray, int, float]:
        """
        Compute GradCAM heatmap for a PIL image.

        Args:
            pil_image:    input image (will be resized to 224x224)
            target_class: class index to explain; None = predicted class

        Returns:
            heatmap:      (H, W) float32 in [0, 1], upsampled to input size
            pred_class:   predicted class index
            confidence:   softmax confidence for pred_class
        """
        self._register_hooks()
        self.model.train()   # enable grad computation through BN layers
        try:
            tensor = INFERENCE_TRANSFORM(pil_image).unsqueeze(0).to(self.device)
            tensor.requires_grad_(True)

            logits = self.model(tensor)
            probs  = torch.softmax(logits, dim=1)[0]
            pred_class = int(probs.argmax())
            confidence = float(probs[pred_class])

            cls_idx = target_class if target_class is not None else pred_class
            self.model.zero_grad()
            logits[0, cls_idx].backward()

            # Global average pool gradients over spatial dims
            weights = self._gradients.mean(dim=(2, 3), keepdim=True)   # (1, C, 1, 1)
            cam = (weights * self._activations).sum(dim=1, keepdim=True)  # (1, 1, H, W)
            cam = torch.relu(cam)

            # Upsample to 224x224
            cam_up = torch.nn.functional.interpolate(
                cam, size=(224, 224), mode="bilinear", align_corners=False
            )
            cam_np = cam_up[0, 0].cpu().numpy()

            # Normalise to [0, 1]
            cam_min, cam_max = cam_np.min(), cam_np.max()
            if cam_max > cam_min:
                cam_np = (cam_np - cam_min) / (cam_max - cam_min)
            else:
                cam_np = np.zeros_like(cam_np)

        finally:
            self._remove_hooks()
            self.model.eval()

        return cam_np, pred_class, confidence
