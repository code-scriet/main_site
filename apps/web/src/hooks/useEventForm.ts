import { useCallback, useState } from 'react';
import type { EventRegistrationField, FAQ, Resource, Speaker } from '@/lib/api';
import { createNewRegistrationField } from '@/lib/eventForm';

interface UseEventFormOptions {
  onChange?: () => void;
}

export interface UseEventFormResult {
  speakers: Speaker[];
  setSpeakers: React.Dispatch<React.SetStateAction<Speaker[]>>;
  addSpeaker: () => void;
  updateSpeaker: (index: number, field: keyof Speaker, value: string) => void;
  removeSpeaker: (index: number) => void;

  resources: Resource[];
  setResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  addResource: () => void;
  updateResource: (index: number, field: keyof Resource, value: string) => void;
  removeResource: (index: number) => void;

  faqs: FAQ[];
  setFaqs: React.Dispatch<React.SetStateAction<FAQ[]>>;
  addFaq: () => void;
  updateFaq: (index: number, field: keyof FAQ, value: string) => void;
  removeFaq: (index: number) => void;

  imageGallery: string[];
  setImageGallery: React.Dispatch<React.SetStateAction<string[]>>;
  addGalleryImage: () => void;
  updateGalleryImage: (index: number, value: string) => void;
  removeGalleryImage: (index: number) => void;

  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  newTag: string;
  setNewTag: React.Dispatch<React.SetStateAction<string>>;
  addTag: () => void;
  removeTag: (index: number) => void;

  registrationFields: EventRegistrationField[];
  setRegistrationFields: React.Dispatch<React.SetStateAction<EventRegistrationField[]>>;
  addRegistrationField: () => void;
  updateRegistrationField: (index: number, patch: Partial<EventRegistrationField>) => void;
  removeRegistrationField: (index: number) => void;
}

/**
 * Manages the array-shaped state that CreateEvent and EditEvent share:
 * speakers, resources, FAQs, image gallery, tags, and custom registration fields.
 *
 * Pass an `onChange` callback to mark the form dirty whenever the user adds
 * or removes an item. (Mutations through the per-row update helpers do not
 * call `onChange` because the parent's `<form onChange>` handler already
 * captures keystroke changes on inputs.)
 */
export function useEventForm({ onChange }: UseEventFormOptions = {}): UseEventFormResult {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [imageGallery, setImageGallery] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [registrationFields, setRegistrationFields] = useState<EventRegistrationField[]>([]);

  const markDirty = useCallback(() => {
    onChange?.();
  }, [onChange]);

  const addSpeaker = useCallback(() => {
    markDirty();
    setSpeakers((prev) => [...prev, { name: '', role: '', bio: '', image: '' }]);
  }, [markDirty]);

  const updateSpeaker = useCallback((index: number, field: keyof Speaker, value: string) => {
    setSpeakers((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }, []);

  const removeSpeaker = useCallback(
    (index: number) => {
      markDirty();
      setSpeakers((prev) => prev.filter((_, i) => i !== index));
    },
    [markDirty],
  );

  const addResource = useCallback(() => {
    markDirty();
    setResources((prev) => [...prev, { title: '', url: '', type: 'link' }]);
  }, [markDirty]);

  const updateResource = useCallback((index: number, field: keyof Resource, value: string) => {
    setResources((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }, []);

  const removeResource = useCallback(
    (index: number) => {
      markDirty();
      setResources((prev) => prev.filter((_, i) => i !== index));
    },
    [markDirty],
  );

  const addFaq = useCallback(() => {
    markDirty();
    setFaqs((prev) => [...prev, { question: '', answer: '' }]);
  }, [markDirty]);

  const updateFaq = useCallback((index: number, field: keyof FAQ, value: string) => {
    setFaqs((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }, []);

  const removeFaq = useCallback(
    (index: number) => {
      markDirty();
      setFaqs((prev) => prev.filter((_, i) => i !== index));
    },
    [markDirty],
  );

  const addGalleryImage = useCallback(() => {
    markDirty();
    setImageGallery((prev) => [...prev, '']);
  }, [markDirty]);

  const updateGalleryImage = useCallback((index: number, value: string) => {
    setImageGallery((prev) => prev.map((url, i) => (i === index ? value : url)));
  }, []);

  const removeGalleryImage = useCallback(
    (index: number) => {
      markDirty();
      setImageGallery((prev) => prev.filter((_, i) => i !== index));
    },
    [markDirty],
  );

  const addTag = useCallback(() => {
    setNewTag((current) => {
      const trimmed = current.trim();
      if (!trimmed) return current;
      setTags((prevTags) => {
        if (prevTags.includes(trimmed)) return prevTags;
        markDirty();
        return [...prevTags, trimmed];
      });
      return '';
    });
  }, [markDirty]);

  const removeTag = useCallback(
    (index: number) => {
      markDirty();
      setTags((prev) => prev.filter((_, i) => i !== index));
    },
    [markDirty],
  );

  const addRegistrationField = useCallback(() => {
    markDirty();
    setRegistrationFields((prev) => [...prev, createNewRegistrationField()]);
  }, [markDirty]);

  const updateRegistrationField = useCallback(
    (index: number, patch: Partial<EventRegistrationField>) => {
      setRegistrationFields((prev) =>
        prev.map((field, i) => (i === index ? { ...field, ...patch } : field)),
      );
    },
    [],
  );

  const removeRegistrationField = useCallback(
    (index: number) => {
      markDirty();
      setRegistrationFields((prev) => prev.filter((_, i) => i !== index));
    },
    [markDirty],
  );

  return {
    speakers,
    setSpeakers,
    addSpeaker,
    updateSpeaker,
    removeSpeaker,
    resources,
    setResources,
    addResource,
    updateResource,
    removeResource,
    faqs,
    setFaqs,
    addFaq,
    updateFaq,
    removeFaq,
    imageGallery,
    setImageGallery,
    addGalleryImage,
    updateGalleryImage,
    removeGalleryImage,
    tags,
    setTags,
    newTag,
    setNewTag,
    addTag,
    removeTag,
    registrationFields,
    setRegistrationFields,
    addRegistrationField,
    updateRegistrationField,
    removeRegistrationField,
  };
}
