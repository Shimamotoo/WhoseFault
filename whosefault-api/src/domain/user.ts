export interface UserProps {
  id?: string;
  firebaseUid: string;
  email?: string | null;
  name?: string | null;
  isAnonymous: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User {
  readonly id: string;
  readonly firebaseUid: string;
  readonly email?: string | null;
  readonly name?: string | null;
  readonly isAnonymous: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    id: string;
    firebaseUid: string;
    email?: string | null;
    name?: string | null;
    isAnonymous: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.firebaseUid = props.firebaseUid;
    this.email = props.email;
    this.name = props.name;
    this.isAnonymous = props.isAnonymous;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: UserProps): User {
    if (!props.firebaseUid || props.firebaseUid.trim() === '') {
      throw new Error('firebaseUid é obrigatório.');
    }

    const now = new Date();
    const id = props.id ?? crypto.randomUUID();
    const createdAt = props.createdAt ?? now;
    const updatedAt = props.updatedAt ?? createdAt;

    return new User({
      id,
      firebaseUid: props.firebaseUid.trim(),
      email: props.email?.trim() || null,
      name: props.name?.trim() || null,
      isAnonymous: Boolean(props.isAnonymous),
      createdAt,
      updatedAt,
    });
  }
}
