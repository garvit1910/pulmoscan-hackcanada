"""
Phase 4b — Classifier Training Loop

Trains LungCancerClassifier on the chest CT-scan PNG dataset.

Actual dataset layout (Kaggle download):
    data/chest-ctscan-images/Data/
        train/
            adenocarcinoma_left.lower.lobe_T2_N0_M0_Ib/   *.png
            large.cell.carcinoma_left.hilum_T2_N2_M0_IIIa/ *.png
            normal/                                          *.png
            squamous.cell.carcinoma_left.hilum_T1_N2_M0_IIIa/ *.png
        valid/   (same structure)
        test/    (plain class names)

Staging-encoded folder names are mapped to 4 canonical classes by prefix.

Run:
    python -m ml.train
    python -m ml.train --data data/chest-ctscan-images/Data --epochs 20 --lr 1e-4
"""

import argparse
import glob as glob_module
import logging
import os
import re
import time

import torch
import torch.nn as nn
import torchvision.transforms as T
from PIL import Image
from torch.utils.data import DataLoader, Dataset, random_split

from ml.classifier import (
    LungCancerClassifier,
    IMAGENET_MEAN,
    IMAGENET_STD,
    NUM_CLASSES,
    save_checkpoint,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_DATA_DIR   = os.path.join(os.path.dirname(__file__), "..", "data", "chest-ctscan-images", "Data")
DEFAULT_CKPT_DIR   = os.path.join(os.path.dirname(__file__), "checkpoints")
DEFAULT_CKPT_PATH  = os.path.join(DEFAULT_CKPT_DIR, "best_model.pth")


# ---------------------------------------------------------------------------
# Transforms
# ---------------------------------------------------------------------------

TRAIN_TRANSFORM = T.Compose([
    T.Resize((224, 224)),
    T.RandomHorizontalFlip(),
    T.RandomRotation(10),
    T.ColorJitter(brightness=0.2, contrast=0.2),
    T.ToTensor(),
    T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])

VAL_TRANSFORM = T.Compose([
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])


# ---------------------------------------------------------------------------
# Staging folder → canonical class mapping
# ---------------------------------------------------------------------------

# The Kaggle dataset encodes TNM staging in folder names. Map the first
# recognisable token back to one of the 4 canonical classes.
STAGING_TO_CLASS = {
    "adenocarcinoma": "adenocarcinoma",
    "large":          "large_cell_carcinoma",
    "squamous":       "squamous_cell_carcinoma",
    "normal":         "normal",
}

# Canonical classes sorted alphabetically (matches CLASSES in classifier.py)
CANONICAL_CLASSES = sorted(set(STAGING_TO_CLASS.values()))
CLASS_TO_IDX = {cls: i for i, cls in enumerate(CANONICAL_CLASSES)}


def _folder_to_class(folder_name: str) -> str:
    """Map a staging-encoded folder name to a canonical class name."""
    # Split on underscores and dots; first token identifies the class
    first_token = re.split(r"[_.]", folder_name.lower())[0]
    if first_token in STAGING_TO_CLASS:
        return STAGING_TO_CLASS[first_token]
    # Fallback: check if any key is a prefix of the folder name
    for key, cls in STAGING_TO_CLASS.items():
        if folder_name.lower().startswith(key):
            return cls
    raise ValueError(f"Cannot map folder '{folder_name}' to a canonical class")


# ---------------------------------------------------------------------------
# Custom Dataset — handles staging-encoded folder names
# ---------------------------------------------------------------------------

class StagingImageDataset(Dataset):
    """
    Loads PNG/JPG images from staging-encoded subdirectories and maps them
    to 4 canonical lung cancer classes.

    Works whether subfolders use plain class names (normal/) or
    staging names (adenocarcinoma_left.lower.lobe_T2_N0_M0_Ib/).
    """

    def __init__(self, split_dir: str, transform=None):
        self.transform   = transform
        self.class_to_idx = CLASS_TO_IDX
        self.samples: list = []

        for subdir in sorted(os.scandir(split_dir), key=lambda e: e.name):
            if not subdir.is_dir():
                continue
            try:
                class_name = _folder_to_class(subdir.name)
            except ValueError as exc:
                logger.warning("Skipping unrecognised folder: %s", exc)
                continue

            class_idx = self.class_to_idx[class_name]
            for ext in ("*.png", "*.jpg", "*.jpeg", "*.PNG", "*.JPG"):
                for img_path in glob_module.glob(os.path.join(subdir.path, ext)):
                    self.samples.append((img_path, class_idx))

        logger.info("StagingImageDataset: %d images from %s", len(self.samples), split_dir)

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        img = Image.open(img_path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label


# ---------------------------------------------------------------------------
# Dataset helpers
# ---------------------------------------------------------------------------

def _find_split_dirs(data_root: str):
    """
    Return (train_dir, val_dir).

    Detects train/valid split or falls back to flat layout.
    """
    train_dir = os.path.join(data_root, "train")
    if os.path.isdir(train_dir):
        for val_name in ("valid", "val", "test"):
            val_dir = os.path.join(data_root, val_name)
            if os.path.isdir(val_dir):
                return train_dir, val_dir
        return train_dir, None   # will do 80/20 split

    # Flat layout — all class folders directly under data_root
    return data_root, None


def build_dataloaders(data_root: str, batch_size: int = 32, num_workers: int = 4):
    """
    Build train and val DataLoaders from the chest CT PNG dataset.

    Returns:
        (train_loader, val_loader, class_to_idx)
    """
    train_dir, val_dir = _find_split_dirs(data_root)

    if val_dir is not None:
        logger.info("Using pre-split: train=%s  val=%s", train_dir, val_dir)
        train_ds = StagingImageDataset(train_dir, transform=TRAIN_TRANSFORM)
        val_ds   = StagingImageDataset(val_dir,   transform=VAL_TRANSFORM)
    else:
        logger.info("No val split found — doing 80/20 random split on %s", train_dir)
        full_ds  = StagingImageDataset(train_dir, transform=TRAIN_TRANSFORM)
        n_val    = max(1, int(0.2 * len(full_ds)))
        n_train  = len(full_ds) - n_val
        generator = torch.Generator().manual_seed(42)
        train_ds, val_ds = random_split(full_ds, [n_train, n_val], generator=generator)

    logger.info("Train: %d samples  Val: %d samples", len(train_ds), len(val_ds))
    logger.info("class_to_idx: %s", CLASS_TO_IDX)

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=num_workers, pin_memory=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        num_workers=num_workers, pin_memory=True,
    )
    return train_loader, val_loader, CLASS_TO_IDX


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------

def train(
    data_root: str = DEFAULT_DATA_DIR,
    checkpoint_path: str = DEFAULT_CKPT_PATH,
    epochs: int = 20,
    lr: float = 1e-4,
    weight_decay: float = 1e-2,
    batch_size: int = 32,
    num_workers: int = 4,
):
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    logger.info("Device: %s", device)

    # Data
    train_loader, val_loader, class_to_idx = build_dataloaders(
        data_root, batch_size=batch_size, num_workers=num_workers
    )

    # Model
    model = LungCancerClassifier(num_classes=NUM_CLASSES).to(device)
    logger.info("Model: EfficientNet-B0, %d classes", NUM_CLASSES)

    # Loss, optimiser, scheduler
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", patience=3, factor=0.5,
    )

    best_val_acc = 0.0

    for epoch in range(1, epochs + 1):
        # --- Train ---
        model.train()
        t0 = time.time()
        train_loss, train_correct, train_total = 0.0, 0, 0

        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss    = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            train_loss    += loss.item() * images.size(0)
            preds          = outputs.argmax(dim=1)
            train_correct += (preds == labels).sum().item()
            train_total   += images.size(0)

        train_loss /= train_total
        train_acc   = train_correct / train_total

        # --- Validate ---
        model.eval()
        val_loss, val_correct, val_total = 0.0, 0, 0

        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                outputs = model(images)
                loss    = criterion(outputs, labels)

                val_loss    += loss.item() * images.size(0)
                preds        = outputs.argmax(dim=1)
                val_correct += (preds == labels).sum().item()
                val_total   += images.size(0)

        val_loss /= val_total
        val_acc   = val_correct / val_total

        scheduler.step(val_loss)

        elapsed = time.time() - t0
        logger.info(
            "Epoch %d/%d | train_loss=%.4f acc=%.3f | val_loss=%.4f acc=%.3f | %.1fs",
            epoch, epochs, train_loss, train_acc, val_loss, val_acc, elapsed,
        )

        # Save best checkpoint
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            save_checkpoint(model, checkpoint_path, epoch, val_acc, class_to_idx)
            logger.info("  ↑ New best val_acc=%.4f — checkpoint saved", val_acc)

    logger.info("Training complete. Best val_acc=%.4f", best_val_acc)
    return model, best_val_acc


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _parse_args():
    p = argparse.ArgumentParser(description="Train LungCancerClassifier")
    p.add_argument("--data",    default=DEFAULT_DATA_DIR, help="Path to chest-ctscan-images/")
    p.add_argument("--output",  default=DEFAULT_CKPT_PATH, help="Checkpoint output path")
    p.add_argument("--epochs",  type=int,   default=20)
    p.add_argument("--lr",      type=float, default=1e-4)
    p.add_argument("--batch",   type=int,   default=32)
    p.add_argument("--workers", type=int,   default=4)
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    train(
        data_root=args.data,
        checkpoint_path=args.output,
        epochs=args.epochs,
        lr=args.lr,
        batch_size=args.batch,
        num_workers=args.workers,
    )
