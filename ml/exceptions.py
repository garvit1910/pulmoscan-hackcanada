"""Typed exceptions for each pipeline phase."""


class DicomLoadError(Exception):
    """Raised when DICOM loading or parsing fails."""
    pass


class SegmentationError(Exception):
    """Raised when lung segmentation fails."""
    pass


class PathologyError(Exception):
    """Raised when pathology detection fails."""
    pass


class PipelineError(Exception):
    """Raised for general orchestration failures."""
    pass
