import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpsertNoteDto {
  @IsString({ message: 'Note text must be a string' })
  @IsNotEmpty({ message: 'Note text is required' })
  @MaxLength(2000, { message: 'Note text must be at most 2000 characters long' })
  text!: string;
}
