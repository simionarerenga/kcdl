// src/components/Modal.jsx
export default function Modal({ type, src, text, onClose }) {
  if (!src && !text) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <button className="modal-close" onClick={onClose} aria-label="Close modal">
        &times;
      </button>
      {type === 'image' && (
        <img
          className="modal-image"
          src={src}
          alt="Full-size view"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {type === 'comment' && (
        <div
          className="modal-comment-box"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </div>
      )}
    </div>
  );
}
